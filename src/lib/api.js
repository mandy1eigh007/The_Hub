// ── REST helper with timeout ──────────────────────────────────────────────────
export async function apiFetch(url, method = 'GET', body, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const opts = { method, headers: {}, signal: controller.signal };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  try {
    const r = await fetch(url, opts);
    clearTimeout(timer);
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r.status}`); }
    return r.json();
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('Request timed out — server may be restarting');
    throw e;
  }
}

// ── SSE stream reader ─────────────────────────────────────────────────────────
// Reads a text/event-stream response and calls onData for each parsed JSON event.
// Respects the AbortController signal so Stop button cancels mid-stream.
export async function readSSE(response, signal, onData) {
  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') return;
        try { onData(JSON.parse(raw)); } catch {}
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') throw e;
  } finally {
    reader.releaseLock();
  }
}

// ── Single-AI stream ──────────────────────────────────────────────────────────
// Returns the full text on completion, null if aborted or errored.
export async function streamAI(endpoint, messages, system, signal, onToken) {
  let r;
  try {
    r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, system }),
      signal
    });
  } catch (e) {
    if (e.name !== 'AbortError') throw e;
    return null;
  }

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${r.status})`);
  }

  let full = '';
  await readSSE(r, signal, d => {
    if (d.error) throw new Error(d.error);
    if (d.text) { full += d.text; onToken(d.text, full); }
  });
  return full;
}

// ── Both-mode stream ──────────────────────────────────────────────────────────
// Returns { claude, gpt } text when both complete.
export async function streamBoth(messages, system, signal, onToken) {
  let r;
  try {
    r = await fetch('/api/chat/both', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, system }),
      signal
    });
  } catch (e) {
    if (e.name !== 'AbortError') throw e;
    return null;
  }

  if (!r.ok) throw new Error('Both mode request failed');

  let cf = '', gf = '';
  let claudeErr = false, gptErr = false;
  await readSSE(r, signal, d => {
    if (d.source === 'claude') {
      if (d.error) { cf = '⚠ ' + d.error; claudeErr = true; }
      else if (d.text && !claudeErr) { cf += d.text; onToken('claude', d.text, cf); }
    }
    if (d.source === 'gpt') {
      if (d.error) { gf = '⚠ ' + d.error; gptErr = true; }
      else if (d.text && !gptErr) { gf += d.text; onToken('gpt', d.text, gf); }
    }
  });
  return { claude: cf, gpt: gf };
}
