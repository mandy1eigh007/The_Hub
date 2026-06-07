const express  = require('express');
const session  = require('express-session');
const FileStore = require('session-file-store')(session);
const rateLimit = require('express-rate-limit');
const helmet   = require('helmet');
const { google } = require('googleapis');
const fetch    = require('node-fetch');
const { Readable } = require('stream');
const crypto   = require('crypto');
const path     = require('path');

const app     = express();
const PORT    = process.env.PORT || 3000;
const BASE_URL = (process.env.REPLIT_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const REDIRECT = BASE_URL + '/auth/callback';
const IS_PROD  = !!process.env.REPLIT_URL;

// Trust Replit's reverse proxy â€” required for accurate req.ip in rate limiting
app.set('trust proxy', 1);

// Security headers â€” CSP disabled because we load Google Fonts externally
// and renderMd injects trusted HTML. Re-enable with proper directives if needed.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// â”€â”€ Middleware â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Split body limits: images need up to 15mb, everything else is tiny
app.use('/api/drive/image', express.json({ limit: '15mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

app.use(session({
  // FileStore persists sessions to disk â€” API keys survive Replit restarts
  store: new FileStore({
    path: './sessions',
    ttl: 30 * 24 * 60 * 60,
    retries: 0,
    reapInterval: 60 * 60
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: IS_PROD,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}));

// Rate limit AI chat routes: 30 requests/min is generous for personal use
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests â€” please slow down' }
});

// â”€â”€ API key encryption (AES-256-GCM) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Keys are encrypted in the session file. If SESSION_SECRET changes, users
// re-enter keys. The derived key is cached to avoid repeated scrypt calls.
const _keyCache = {};
const _KEY_CACHE_MAX = 3;

function _deriveKey(secret) {
  if (_keyCache[secret]) return _keyCache[secret];
  const keys = Object.keys(_keyCache);
  if (keys.length >= _KEY_CACHE_MAX) delete _keyCache[keys[0]];
  const k = crypto.scryptSync(secret, 'hub-key-salt', 32);
  _keyCache[secret] = k;
  return k;
}

function encryptKey(plaintext) {
  if (!plaintext) return null;
  try {
    const secret = process.env.SESSION_SECRET || 'dev-secret-change-me';
    const iv  = crypto.randomBytes(16);
    const key = _deriveKey(secret);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + tag.toString('hex') + ':' + enc.toString('hex');
  } catch (e) {
    console.error('encryptKey failed:', e.message);
    return null;
  }
}

function decryptKey(ciphertext) {
  if (!ciphertext) return null;
  try {
    const [ivHex, tagHex, encHex] = ciphertext.split(':');
    if (!ivHex || !tagHex || !encHex) return null;
    const secret = process.env.SESSION_SECRET || 'dev-secret-change-me';
    const key = _deriveKey(secret);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex'), null, 'utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

// â”€â”€ OAuth helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT
  );
}

function driveClient(tokens) {
  const auth = oauthClient();
  auth.setCredentials(tokens);
  return google.drive({ version: 'v3', auth });
}

async function refreshIfNeeded(req) {
  if (!req.session.tokens) return;
  const exp = req.session.tokens.expiry_date;
  if (exp && exp < Date.now() + 120000) {
    try {
      const auth = oauthClient();
      auth.setCredentials(req.session.tokens);
      const { credentials } = await auth.refreshAccessToken();
      req.session.tokens = credentials;
      // Persist updated tokens so FileStore doesn't lose them on fast requests
      await new Promise(resolve => req.session.save(resolve));
    } catch (e) {
      console.error('Token refresh failed:', e.message);
    }
  }
}

function requireAuth(req, res, next) {
  if (!req.session.tokens) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// SSE headers â€” X-Accel-Buffering stops Replit's nginx from buffering the stream
function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // lock CORS to own origin instead of wildcard
  res.setHeader('Access-Control-Allow-Origin', BASE_URL);
  res.flushHeaders();
}

// â”€â”€ Auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/auth/login', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.send('<h2>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Replit Secrets first. See SETUP.md.</h2>');
  }
  const url = oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ]
  });
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/?error=auth_failed');
  try {
    const auth = oauthClient();
    const { tokens } = await auth.getToken(code);
    req.session.tokens = tokens;
    auth.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth });
    const { data } = await oauth2.userinfo.get();
    req.session.user = { name: data.name, email: data.email, picture: data.picture };
    res.redirect('/');
  } catch (e) {
    console.error('Auth error:', e.message);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/auth/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });

app.get('/auth/me', (req, res) => {
  if (!req.session.tokens) return res.json({ authenticated: false });
  res.json({
    authenticated: true,
    user: req.session.user,
    vaultFolderId: req.session.vaultFolderId || null,
    sys: req.session.sys || null,
    hasClaudeKey: !!(req.session.anthropicKey || process.env.ANTHROPIC_API_KEY),
    hasGptKey:    !!(req.session.openaiKey    || process.env.OPENAI_API_KEY)
  });
});

// â”€â”€ AI Keys â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/keys', requireAuth, (req, res) => {
  const { anthropicKey, openaiKey } = req.body;
  const MAX_KEY_LEN = 300;
  if (anthropicKey && (typeof anthropicKey !== 'string' || anthropicKey.length > MAX_KEY_LEN))
    return res.status(400).json({ error: 'Invalid API key' });
  if (openaiKey && (typeof openaiKey !== 'string' || openaiKey.length > MAX_KEY_LEN))
    return res.status(400).json({ error: 'Invalid API key' });
  if (anthropicKey) req.session.anthropicKey = encryptKey(anthropicKey.trim());
  if (openaiKey)    req.session.openaiKey    = encryptKey(openaiKey.trim());
  res.json({
    claude: !!(req.session.anthropicKey || process.env.ANTHROPIC_API_KEY),
    gpt:    !!(req.session.openaiKey    || process.env.OPENAI_API_KEY)
  });
});

// â”€â”€ SSE stream pipe â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// finished flag prevents double-fire when message_stop AND body.end both fire
function pipeSSEStream(body, parser, onToken, onDone, onError) {
  let buf = '', finished = false;
  const done = () => { if (!finished) { finished = true; onDone(); } };
  body.on('data', chunk => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const result = parser(line.slice(6).trim());
      if (result === 'DONE') { done(); return; }
      if (result) onToken(result);
    }
  });
  body.on('end', done);
  body.on('error', onError);
}

const claudeParser = raw => {
  try {
    const d = JSON.parse(raw);
    if (d.type === 'message_stop') return 'DONE';
    if (d.type === 'content_block_delta' && d.delta?.text) return d.delta.text;
    return null;
  } catch { return null; }
};

const gptParser = raw => {
  if (raw === '[DONE]') return 'DONE';
  try { return JSON.parse(raw).choices?.[0]?.delta?.content || null; }
  catch { return null; }
};

// â”€â”€ Input validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function validateMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) return 'messages must be a non-empty array';
  if (messages.length > 100) return 'messages array exceeds 100 items';
  for (const m of messages) {
    if (!m || typeof m !== 'object') return 'each message must be an object';
    if (!['user', 'assistant'].includes(m.role)) return `invalid role: ${m.role}`;
    // content can be a string (text-only) or an array of content blocks (vision)
    if (typeof m.content === 'string') {
      if (m.content.length > 100_000) return 'message content exceeds 100k characters';
    } else if (Array.isArray(m.content)) {
      if (m.content.length > 20) return 'content blocks exceed 20 items';
      for (const block of m.content) {
        if (!block || typeof block !== 'object') return 'invalid content block';
        if (!['text', 'image_url', 'image'].includes(block.type)) return `invalid block type: ${block.type}`;
        if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 100_000)
          return 'text block exceeds 100k characters';
      }
    } else {
      return 'message content must be a string or array';
    }
  }
  return null;
}

function validateSystem(system) {
  if (system === undefined || system === null) return null;
  if (typeof system !== 'string') return 'system must be a string';
  if (system.length > 10_000) return 'system prompt exceeds 10k characters';
  return null;
}

// Convert messages with Claude-format image blocks to GPT image_url format.
// Claude: { type:'image', source:{ type:'base64', media_type, data } }
// GPT:    { type:'image_url', image_url:{ url:'data:mime;base64,data' } }
function toGptMessages(messages) {
  return messages.map(m => {
    if (!Array.isArray(m.content)) return m;
    return {
      ...m,
      content: m.content.map(block => {
        if (block.type !== 'image') return block;
        const { media_type, data } = block.source;
        return { type: 'image_url', image_url: { url: `data:${media_type};base64,${data}` } };
      })
    };
  });
}

// â”€â”€ Claude â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/chat/claude', requireAuth, aiLimiter, async (req, res) => {
  const { messages, system } = req.body;
  const msgErr = validateMessages(messages);
  const sysErr = validateSystem(system);
  if (msgErr) return res.status(400).json({ error: msgErr });
  if (sysErr) return res.status(400).json({ error: sysErr });

  const apiKey = decryptKey(req.session.anthropicKey) || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'No Anthropic API key â€” add it in Settings.' });

  sseHeaders(res);

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8096,
        system: system || undefined,
        messages,
        stream: true
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      res.write(`data: ${JSON.stringify({ error: err.error?.message || `Claude error ${response.status}` })}\n\n`);
      return res.end();
    }

    pipeSSEStream(
      response.body, claudeParser,
      text => res.write(`data: ${JSON.stringify({ text })}\n\n`),
      ()   => { res.write('data: [DONE]\n\n'); res.end(); },
      ()   => res.end()
    );
  } catch (e) {
    if (e.name !== 'AbortError') res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});

// â”€â”€ GPT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/chat/gpt', requireAuth, aiLimiter, async (req, res) => {
  const { messages, system } = req.body;
  const msgErr = validateMessages(messages);
  const sysErr = validateSystem(system);
  if (msgErr) return res.status(400).json({ error: msgErr });
  if (sysErr) return res.status(400).json({ error: sysErr });

  const apiKey = decryptKey(req.session.openaiKey) || process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'No OpenAI API key â€” add it in Settings.' });

  sseHeaders(res);

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  const msgs = toGptMessages(system ? [{ role: 'system', content: system }, ...messages] : messages);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'gpt-4o', messages: msgs, stream: true, max_tokens: 8096 }),
      signal: controller.signal
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      res.write(`data: ${JSON.stringify({ error: err.error?.message || `GPT error ${response.status}` })}\n\n`);
      return res.end();
    }

    pipeSSEStream(
      response.body, gptParser,
      text => res.write(`data: ${JSON.stringify({ text })}\n\n`),
      ()   => { res.write('data: [DONE]\n\n'); res.end(); },
      ()   => res.end()
    );
  } catch (e) {
    if (e.name !== 'AbortError') res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});

// â”€â”€ Both â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/chat/both', requireAuth, aiLimiter, async (req, res) => {
  const { messages, system } = req.body;
  const msgErr = validateMessages(messages);
  const sysErr = validateSystem(system);
  if (msgErr) return res.status(400).json({ error: msgErr });
  if (sysErr) return res.status(400).json({ error: sysErr });

  const anthropicKey = decryptKey(req.session.anthropicKey) || process.env.ANTHROPIC_API_KEY;
  const openaiKey    = decryptKey(req.session.openaiKey)    || process.env.OPENAI_API_KEY;

  sseHeaders(res);

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  let claudeDone = false, gptDone = false;

  function checkAllDone() {
    if (claudeDone && gptDone) { res.write('data: [DONE]\n\n'); res.end(); }
  }

  if (anthropicKey) {
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 8096, system: system || undefined, messages, stream: true }),
      signal: controller.signal
    }).then(r => {
      if (!r.ok) {
        res.write(`data: ${JSON.stringify({ source: 'claude', error: `Claude error ${r.status}` })}\n\n`);
        claudeDone = true; checkAllDone(); return;
      }
      pipeSSEStream(
        r.body, claudeParser,
        t  => res.write(`data: ${JSON.stringify({ source: 'claude', text: t })}\n\n`),
        () => { if (!claudeDone) { claudeDone = true; res.write(`data: ${JSON.stringify({ source: 'claude', done: true })}\n\n`); checkAllDone(); } },
        () => { if (!claudeDone) { claudeDone = true; checkAllDone(); } }
      );
    }).catch(e => {
      if (e.name === 'AbortError') { claudeDone = true; checkAllDone(); return; }
      res.write(`data: ${JSON.stringify({ source: 'claude', error: e.message })}\n\n`);
      claudeDone = true; checkAllDone();
    });
  } else {
    res.write(`data: ${JSON.stringify({ source: 'claude', error: 'No Claude key configured' })}\n\n`);
    claudeDone = true;
  }

  if (openaiKey) {
    const msgs = toGptMessages(system ? [{ role: 'system', content: system }, ...messages] : messages);
    fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + openaiKey },
      body: JSON.stringify({ model: 'gpt-4o', messages: msgs, stream: true, max_tokens: 8096 }),
      signal: controller.signal
    }).then(r => {
      if (!r.ok) {
        res.write(`data: ${JSON.stringify({ source: 'gpt', error: `GPT error ${r.status}` })}\n\n`);
        gptDone = true; checkAllDone(); return;
      }
      pipeSSEStream(
        r.body, gptParser,
        t  => res.write(`data: ${JSON.stringify({ source: 'gpt', text: t })}\n\n`),
        () => { if (!gptDone) { gptDone = true; res.write(`data: ${JSON.stringify({ source: 'gpt', done: true })}\n\n`); checkAllDone(); } },
        () => { if (!gptDone) { gptDone = true; checkAllDone(); } }
      );
    }).catch(e => {
      if (e.name === 'AbortError') { gptDone = true; checkAllDone(); return; }
      res.write(`data: ${JSON.stringify({ source: 'gpt', error: e.message })}\n\n`);
      gptDone = true; checkAllDone();
    });
  } else {
    res.write(`data: ${JSON.stringify({ source: 'gpt', error: 'No GPT key configured' })}\n\n`);
    gptDone = true;
  }

  checkAllDone();
});

// â”€â”€ Drive â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function getOrCreateFolder(name, parentId, drive) {
  try {
    const s = await drive.files.list({
      q: `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)', pageSize: 1
    });
    if (s.data.files.length) return s.data.files[0].id;
    const c = await drive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id'
    });
    return c.data.id;
  } catch (e) {
    console.error('Folder create error:', e.message);
    return null;
  }
}

app.post('/api/drive/save', requireAuth, async (req, res) => {
  const { content, folder, filename, existingFileId } = req.body;
  const folderId = req.session.vaultFolderId;
  if (!folderId) return res.status(400).json({ error: 'No vault folder configured' });
  if (!content || typeof content !== 'string' || content.length > 2_000_000)
    return res.status(400).json({ error: 'Invalid content' });
  if (!filename || typeof filename !== 'string' || !/^[\w\-. ]+\.md$/.test(filename))
    return res.status(400).json({ error: 'Invalid filename' });

  try {
    await refreshIfNeeded(req);
    const drive = driveClient(req.session.tokens);

    if (existingFileId) {
      try {
        await drive.files.update({ fileId: existingFileId, media: { mimeType: 'text/plain', body: content } });
        return res.json({ ok: true, fileId: existingFileId, updated: true });
      } catch (e) {
        console.warn('Drive update failed, creating new:', e.message);
      }
    }

    const subId = await getOrCreateFolder(folder || 'Conversations', folderId, drive);
    if (!subId) return res.status(500).json({ error: 'Could not create subfolder' });
    const file = await drive.files.create({
      requestBody: { name: filename, mimeType: 'text/plain', parents: [subId] },
      media: { mimeType: 'text/plain', body: content },
      fields: 'id,name'
    });
    res.json({ ok: true, fileId: file.data.id, updated: false });
  } catch (e) {
    console.error('Drive save error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/drive/image', requireAuth, async (req, res) => {
  const { filename, base64, mimeType } = req.body;
  const folderId = req.session.vaultFolderId;
  if (!folderId) return res.status(400).json({ error: 'No vault folder configured' });

  const ALLOWED_MIME = new Set(['image/jpeg','image/png','image/gif','image/webp','image/svg+xml']);
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  if (!base64 || typeof base64 !== 'string')
    return res.status(400).json({ error: 'base64 image data required' });
  if (!ALLOWED_MIME.has(mimeType))
    return res.status(400).json({ error: 'Invalid image type' });
  if (Math.ceil(base64.length * 0.75) > MAX_IMAGE_BYTES)
    return res.status(400).json({ error: 'Image exceeds 10MB' });
  if (!filename || typeof filename !== 'string' || filename.length > 200)
    return res.status(400).json({ error: 'Invalid filename' });

  try {
    await refreshIfNeeded(req);
    const drive = driveClient(req.session.tokens);
    const imgFolderId = await getOrCreateFolder('Images', folderId, drive);
    if (!imgFolderId) return res.status(500).json({ error: 'Could not create Images folder' });

    const buf = Buffer.from(base64, 'base64');
    const file = await drive.files.create({
      requestBody: { name: filename, mimeType, parents: [imgFolderId] },
      media: { mimeType, body: Readable.from(buf) },
      fields: 'id,name'
    });
    await drive.permissions.create({ fileId: file.data.id, requestBody: { role: 'reader', type: 'anyone' } });
    res.json({ ok: true, url: `https://drive.google.com/uc?id=${file.data.id}`, fileId: file.data.id });
  } catch (e) {
    console.error('Image upload error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/drive/folder/:id', requireAuth, async (req, res) => {
  try {
    await refreshIfNeeded(req);
    const drive = driveClient(req.session.tokens);
    const f = await drive.files.get({ fileId: req.params.id, fields: 'id,name' });
    res.json(f.data);
  } catch {
    res.status(404).json({ error: 'Folder not found â€” check the ID' });
  }
});

app.post('/api/vault/folder', requireAuth, (req, res) => {
  const { folderId } = req.body;
  if (!folderId || typeof folderId !== 'string')
    return res.status(400).json({ error: 'folderId required' });
  if (!/^[a-zA-Z0-9_\-]{10,60}$/.test(folderId.trim()))
    return res.status(400).json({ error: 'Invalid folder ID format' });
  req.session.vaultFolderId = folderId.trim();
  res.json({ ok: true });
});

// â”€â”€ Memory extraction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// After a conversation, Claude reads the transcript and extracts facts worth
// remembering â€” things about the user, their work, decisions, preferences.
// The extracted memory is appended to the user's system prompt automatically.
app.post('/api/memory/extract', requireAuth, aiLimiter, async (req, res) => {
  const { transcript, currentMemory } = req.body;
  if (!transcript || typeof transcript !== 'string' || transcript.length > 50_000)
    return res.status(400).json({ error: 'Invalid transcript' });

  const apiKey = decryptKey(req.session.anthropicKey) || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'No Anthropic API key' });

  const prompt = `You are a memory extraction assistant. Given a conversation transcript, extract ONLY new, specific, useful facts about the user that are worth remembering long-term. Things like: their name, role, workplace, projects they're working on, preferences, decisions made, people they mentioned, problems they solved.

Be extremely selective. Only extract facts that would genuinely help future conversations. Do NOT extract generic facts, things already in their memory, or anything obvious.

Current memory:
${currentMemory || '(none)'}

Conversation transcript:
${transcript}

Return ONLY a JSON object with this exact shape (no other text):
{"facts": ["fact 1", "fact 2"]}

If there are no new facts worth remembering, return: {"facts": []}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) return res.status(502).json({ error: 'Claude API error' });

    const data = await response.json();
    const text = data.content?.[0]?.text || '{"facts":[]}';
    try {
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      res.json({ facts: Array.isArray(parsed.facts) ? parsed.facts.slice(0, 20) : [] });
    } catch {
      res.json({ facts: [] });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save updated system prompt back to server session (persists across page reloads)
app.post('/api/memory/save', requireAuth, (req, res) => {
  const { sys } = req.body;
  if (typeof sys !== 'string' || sys.length > 10_000)
    return res.status(400).json({ error: 'Invalid system prompt' });
  req.session.sys = sys;
  res.json({ ok: true });
});

// Global error handler â€” prevents stack traces leaking to clients
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message || err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
});

// â”€â”€ Serve â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SPA fallback â€” only for non-API routes so unknown API paths get 404, not HTML
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`The Hub running â†’ ${BASE_URL}`));
