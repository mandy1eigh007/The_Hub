import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { MessageList } from './MessageList.jsx';
import { streamAI, streamBoth, apiFetch } from '../lib/api.js';
import { buildApiMessages, sanitizeFilename, buildSessionMd } from '../lib/utils.js';
import { persistPrefs } from '../lib/storage.js';

const STARTERS = [
  "What should we work on today?",
  "Help me think through a problem I'm having",
  "Let's build something new",
  "Review my code and suggest improvements",
  "What do you know about me?",
];

// Stable message id — monotonic counter so MessageList can key on m._id
let _msgSeq = 0;
function msgId() { return ++_msgSeq; }

export function ChatPage({ cur, mode, prefs, streaming, streamController,
                          imgs, imgRegistry, driveFileIds, dispatch }) {

  const [text, setText] = useState('');
  const taRef        = useRef(null);
  const listRef      = useRef(null);
  const fileRef      = useRef(null);
  const saveTimerRef = useRef(null);
  const chatAreaRef  = useRef(null);
  const curRef              = useRef(cur);
  // Track which session ids we've already run memory extraction on
  const memoryExtractedRef  = useRef(new Set());
  useEffect(() => { curRef.current = cur; }, [cur]);

  // Scroll to bottom whenever the active session changes (load or new chat).
  // rAF defers one frame so Preact finishes rendering the new message list first.
  useEffect(() => {
    if (cur?.id) {
      requestAnimationFrame(() => listRef.current?.scrollToBottom(true));
    }
  }, [cur?.id]);

  // Clear pending Drive save timer on unmount
  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  const messages = cur?.messages || [];
  const isEmpty  = messages.length === 0;

  const growTa = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
  }, []);

  // Core stream runner — used by send, edit, and regenerate
  const runStream = useCallback(async (session, content, currentImgs, sessionId) => {
    const history = session.messages;
    const apiMsgs = buildApiMessages(history, imgRegistry);

    // Build the current user message content block
    if (currentImgs.length > 0) {
      const imgBlocks = currentImgs
        .map(i => imgRegistry[i.id])
        .filter(Boolean)
        .map(dataUrl => {
          const [header, data] = dataUrl.split(',');
          const media_type = header.replace('data:', '').replace(';base64', '');
          return { type: 'image', source: { type: 'base64', media_type, data } };
        });
      const contentBlocks = [];
      if (content) contentBlocks.push({ type: 'text', text: content });
      contentBlocks.push(...imgBlocks);
      apiMsgs.push({ role: 'user', content: contentBlocks });
    } else {
      apiMsgs.push({ role: 'user', content: content || 'See attached image' });
    }

    const sys = prefs.sys || undefined;
    const controller = new AbortController();
    dispatch({ type: 'STREAM_START', controller });

    try {
      if (mode === 'claude' || mode === 'gpt') {
        const bubbleId = 'b' + Date.now();
        listRef.current?.startStreamBubble(bubbleId, mode);

        const full = await streamAI(
          `/api/chat/${mode}`, apiMsgs, sys, controller.signal,
          token => listRef.current?.appendToken(bubbleId, token)
        );

        if (full !== null) {
          listRef.current?.finalizeStream(bubbleId);
          dispatch({ type: 'PUSH_MESSAGE', message: {
            _id: msgId(), role: 'assistant', source: mode, content: full,
          }});
        }
      } else {
        const cid = 'bc' + Date.now();
        const gid = 'bg' + Date.now() + '_g';
        listRef.current?.startBothBubbles(cid, gid);

        const result = await streamBoth(
          apiMsgs, sys, controller.signal,
          (source, token) => listRef.current?.appendToken(source === 'claude' ? cid : gid, token)
        );

        if (result) {
          listRef.current?.finalizeStream(cid);
          listRef.current?.finalizeStream(gid);
          dispatch({ type: 'PUSH_MESSAGE', message: {
            _id: msgId(), role: 'assistant', source: 'both',
            claude: result.claude, gpt: result.gpt, content: result.claude,
          }});
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') listRef.current?.appendError(e.message);
    }

    dispatch({ type: 'STREAM_END' });

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => driveSave(sessionId), 2000);
  }, [mode, prefs, imgRegistry, dispatch]);

  const send = useCallback(async () => {
    if (streaming) return;
    const content = text.trim();
    if (!content && !imgs.length) return;

    let session = curRef.current;
    if (!session) {
      session = {
        id: Date.now().toString(),
        title: content.slice(0, 55) || 'Image chat',
        mode, messages: [],
        date: new Date().toISOString(),
        synced: false,
      };
      dispatch({ type: 'SET_CUR', cur: session });
      dispatch({ type: 'UPSERT_SESSION', session });
    }

    const sessionId = session.id;
    const currentImgs = [...imgs];

    const userMsg = {
      _id: msgId(),
      role: 'user',
      content,
      imgIds: currentImgs.map(i => ({ id: i.id, name: i.name })),
    };

    dispatch({ type: 'PUSH_MESSAGE', message: userMsg });
    listRef.current?.scrollToBottom(true);

    setText('');
    if (taRef.current) taRef.current.style.height = 'auto';
    dispatch({ type: 'CLEAR_IMGS' });

    // Use the snapshot of session before PUSH_MESSAGE — runStream appends user msg itself
    await runStream(session, content, currentImgs, sessionId);
  }, [streaming, text, imgs, mode, dispatch, runStream]);

  // Edit a user message: truncate history to that message, re-run with edited content
  const editAndResend = useCallback(async (msgIndex, newContent) => {
    if (streaming) return;
    const session = curRef.current;
    if (!session) return;
    // Truncate to just before the edited message
    dispatch({ type: 'TRUNCATE_MESSAGES', fromIndex: msgIndex });
    // Snapshot the history before truncation for runStream
    const history = session.messages.slice(0, msgIndex);
    const editedSession = { ...session, messages: history };
    const editedMsg = {
      _id: msgId(),
      role: 'user',
      content: newContent,
      imgIds: [],
    };
    dispatch({ type: 'PUSH_MESSAGE', message: editedMsg });
    listRef.current?.scrollToBottom(true);
    await runStream(editedSession, newContent, [], session.id);
  }, [streaming, dispatch, runStream]);

  // Regenerate: drop the last assistant response and re-run from the last user message
  const regenerate = useCallback(async (fromIndex) => {
    if (streaming) return;
    const session = curRef.current;
    if (!session) return;
    // fromIndex is the index of the assistant message to drop
    // The user message is at fromIndex - 1
    const userMsg = session.messages[fromIndex - 1];
    if (!userMsg || userMsg.role !== 'user') return;
    dispatch({ type: 'TRUNCATE_MESSAGES', fromIndex });
    const history = session.messages.slice(0, fromIndex - 1);
    const truncatedSession = { ...session, messages: history };
    dispatch({ type: 'PUSH_MESSAGE', message: { ...userMsg, _id: msgId() } });
    listRef.current?.scrollToBottom(true);
    await runStream(truncatedSession, userMsg.content, [], session.id);
  }, [streaming, dispatch, runStream]);

  // Extract memorable facts from a completed conversation and append to system prompt.
  // Fire-and-forget — never blocks the UI or shows errors to the user.
  const extractMemory = useCallback(async (session, currentMemory) => {
    try {
      const transcript = session.messages
        .map(m => {
          if (m.role === 'user') return `User: ${m.content || ''}`;
          if (m.source === 'both') return `Claude: ${m.claude || ''}\nChatGPT: ${m.gpt || ''}`;
          return `${m.source === 'gpt' ? 'ChatGPT' : 'Claude'}: ${m.content || ''}`;
        })
        .join('\n\n');

      const result = await apiFetch('/api/memory/extract', 'POST', { transcript, currentMemory });
      if (!result.facts || result.facts.length === 0) return;

      // Append new facts to system prompt
      const newFacts = result.facts.map(f => `- ${f}`).join('\n');
      const separator = currentMemory ? '\n\n// auto-learned\n' : '// auto-learned\n';
      const updatedSys = (currentMemory + separator + newFacts).trim();

      dispatch({ type: 'SET_PREFS', prefs: { sys: updatedSys } });
      // Persist to localStorage
      persistPrefs({ folderId: prefs.folderId, sys: updatedSys });
      // Also persist to server session so it survives reloads
      await apiFetch('/api/memory/save', 'POST', { sys: updatedSys });
    } catch {
      // Silent — memory extraction is best-effort
    }
  }, [dispatch]);

  // Dispatch SYNC_START/SYNC_END so the Header sync dot animates during saves.
  // After saving, attempt memory extraction in the background (non-blocking).
  const driveSave = useCallback(async (sessionId) => {
    const liveCur = curRef.current;
    if (!liveCur || liveCur.id !== sessionId || liveCur.messages.length < 2) return;
    if (!prefs.folderId) return;
    dispatch({ type: 'SYNC_START' });
    try {
      const content  = buildSessionMd(liveCur);
      const filename = sanitizeFilename(liveCur.title) + '-' + liveCur.id + '.md';
      const r = await apiFetch('/api/drive/save', 'POST', {
        content, folder: 'Conversations', filename,
        existingFileId: driveFileIds[liveCur.id] || null,
      });
      dispatch({ type: 'MARK_SYNCED', fileId: r.fileId });
      // Non-blocking memory extraction — once per session, after first Drive save
      if (!memoryExtractedRef.current.has(liveCur.id)) {
        memoryExtractedRef.current.add(liveCur.id);
        extractMemory(liveCur, prefs.sys || '');
      }
    } catch {
      dispatch({ type: 'SYNC_END' });
      dispatch({ type: 'ADD_TOAST', msg: 'Drive sync failed — saved locally only', toastType: 'w' });
    }
  }, [prefs.folderId, driveFileIds, prefs.sys, dispatch, extractMemory]);


  const addImgs = useCallback(files => {
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = e => {
        const id = 'i' + Date.now() + Math.random().toString(36).slice(2, 5);
        dispatch({ type: 'ADD_IMG', img: { id, name: f.name || 'screenshot.png' }, dataUrl: e.target.result });
      };
      reader.readAsDataURL(f);
    });
  }, [dispatch]);

  useEffect(() => {
    const onPaste = e => {
      const items = Array.from(e.clipboardData?.items || []).filter(i => i.type.startsWith('image/'));
      if (items.length) addImgs(items.map(i => i.getAsFile()).filter(Boolean));
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [addImgs]);

  return (
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      {/* chatAreaRef is the scroll target — passed to MessageList */}
      <div class="chat-area" ref={chatAreaRef}>
        {isEmpty && (
          <div class="chat-empty">
            <div class="ce-mark">⬡</div>
            <div class="ce-title">What's on your mind?</div>
            <div class="ce-sub">
              Pick an AI above, or use Both to get Claude and ChatGPT answering at the same time.
            </div>
            <div class="ce-starters">
              {STARTERS.map(s => (
                <button key={s} class="ce-s" onClick={() => { setText(s); taRef.current?.focus(); }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <MessageList
          ref={listRef}
          chatAreaRef={chatAreaRef}
          messages={messages}
          imgRegistry={imgRegistry}
          streaming={streaming}
          onOpenLightbox={src => dispatch({ type: 'OPEN_LIGHTBOX', src })}
          onEditMessage={editAndResend}
          onRegenerate={regenerate}
        />
      </div>

      {imgs.length > 0 && (
        <div class="inp-imgs" style="background:var(--s1);border-top:1px solid var(--b1)">
          {imgs.map(i => (
            <div key={i.id} class="iimg">
              <img src={imgRegistry[i.id] || ''} alt="" />
              <button class="iimg-x" onClick={() => dispatch({ type: 'REMOVE_IMG', id: i.id })}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div class="input-zone">
        <div class="input-box">
          <div class="inp-main">
            <textarea
              ref={taRef}
              rows={1}
              placeholder="Message…"
              value={text}
              onInput={e => { setText(e.target.value); growTa(); }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <button class="btn btn-g btn-icon" onClick={() => fileRef.current?.click()} title="Attach image">🖼</button>
          </div>
          <div class="inp-foot">
            <div class="inp-hints">
              <span class="inp-hint mode">{{ claude: 'Claude', gpt: 'ChatGPT', both: 'Claude + ChatGPT' }[mode]}</span>
              <span class="inp-hint" style="color:var(--b3)">·</span>
              <span class="inp-hint">Enter to send · Shift+Enter for newline</span>
            </div>
            <div class="send-area">
              {imgs.length > 0 && <span class="ibadge">{imgs.length} 🖼</span>}
              {streaming && (
                <button class="stop-btn" onClick={() => streamController?.abort()}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                  Stop
                </button>
              )}
              <button class="send-btn" disabled={streaming} onClick={send}>
                Send
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple style="display:none"
        onChange={e => { addImgs(Array.from(e.target.files)); e.target.value = ''; }} />
    </div>
  );
}
