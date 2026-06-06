import { useState, useRef, useImperativeHandle, forwardRef } from 'preact/compat';
import { renderMd, esc } from '../lib/utils.js';

// MessageList exposes streaming control via ref (chatAreaRef is owned by ChatPage):
//   ref.current.startStreamBubble(id, source)
//   ref.current.startBothBubbles(cid, gid)
//   ref.current.appendToken(id, token)
//   ref.current.finalizeStream(id)             ← removes stream node; caller dispatches PUSH_MESSAGE after
//   ref.current.appendError(msg)
//   ref.current.scrollToBottom(force)
export const MessageList = forwardRef(function MessageList(
  { messages, imgRegistry, onOpenLightbox, chatAreaRef, streaming, onEditMessage, onRegenerate },
  ref
) {
  // Scroll the actual scrollable container (.chat-area), passed in as chatAreaRef from ChatPage
  const scrollToBottom = (force = false) => {
    const el = chatAreaRef?.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (force || nearBottom) el.scrollTop = el.scrollHeight;
  };

  useImperativeHandle(ref, () => ({
    scrollToBottom,

    startStreamBubble(id, source) {
      const container = document.getElementById('msgs-container');
      if (!container) return;
      const outer = document.createElement('div');
      outer.className = 'msg-outer';
      outer.id = `outer-${id}`;
      const cls   = source === 'claude' ? 'bc' : 'bg';
      const avCls = source === 'claude' ? 'mav-c' : 'mav-g';
      const avTxt = source === 'claude' ? 'C' : 'G';
      outer.innerHTML = `
        <div class="msg">
          <div class="mav ${avCls}">${avTxt}</div>
          <div class="mbub ${cls}" id="${id}">
            <span class="stream-text"></span><span class="cur"></span>
          </div>
        </div>
        <div class="msg-acts">
          <button class="mact" data-copy="${id}">Copy</button>
        </div>`;
      container.appendChild(outer);
      scrollToBottom(true);
    },

    startBothBubbles(cid, gid) {
      const container = document.getElementById('msgs-container');
      if (!container) return;
      const outer = document.createElement('div');
      outer.className = 'msg-outer';
      outer.id = `outer-both-${cid}`;
      outer.innerHTML = `
        <div class="msg both">
          <div class="both-grid">
            <div class="mbub bc" id="${cid}">
              <span class="src-lbl lbl-c">Claude</span>
              <span class="stream-text"></span><span class="cur"></span>
            </div>
            <div class="mbub bg" id="${gid}">
              <span class="src-lbl lbl-g">ChatGPT</span>
              <span class="stream-text"></span><span class="cur"></span>
            </div>
          </div>
        </div>
        <div class="msg-acts">
          <button class="mact" data-copy="${cid}">Copy Claude</button>
          <button class="mact" data-copy="${gid}">Copy GPT</button>
        </div>`;
      container.appendChild(outer);
      scrollToBottom(true);
    },

    // Pure textContent append — zero HTML parsing per token
    appendToken(id, token) {
      const el = document.getElementById(id);
      const span = el?.querySelector('.stream-text');
      if (span) {
        span.textContent += token;
        scrollToBottom(false);
      }
    },

    // Remove the stream DOM node before PUSH_MESSAGE fires — prevents duplicate bubbles.
    finalizeStream(id) {
      const outer = document.getElementById(`outer-${id}`) ||
                    document.getElementById(`outer-both-${id}`);
      if (outer) outer.remove();
    },

    appendError(msg) {
      const container = document.getElementById('msgs-container');
      if (!container) return;
      const outer = document.createElement('div');
      outer.className = 'msg-outer';
      outer.innerHTML = `<div class="mbub berr" style="max-width:100%;font-size:12px;">⚠ ${esc(msg)}</div>`;
      container.appendChild(outer);
      scrollToBottom(true);
    },
  }));

  // Click delegation: copy buttons in dynamically inserted stream bubbles
  const handleClick = e => {
    const copyTarget = e.target.dataset?.copy;
    if (copyTarget) {
      const el = document.getElementById(copyTarget);
      if (el) navigator.clipboard.writeText(el.innerText);
      return;
    }
    const img = e.target.closest('img.img-msg');
    if (img) onOpenLightbox(img.dataset.imgid || img.src);
  };

  return (
    <div id="msgs-container" onClick={handleClick}>
      {messages.map((m, i) => (
        <MessageBubble
          key={m._id}
          msg={m}
          index={i}
          imgRegistry={imgRegistry}
          streaming={streaming}
          onOpenLightbox={onOpenLightbox}
          onEdit={onEditMessage}
          onRegenerate={onRegenerate}
          isLast={i === messages.length - 1}
        />
      ))}
    </div>
  );
});

function MessageBubble({ msg, index, imgRegistry, streaming, onOpenLightbox, onEdit, onRegenerate, isLast }) {
  if (msg.role === 'user') {
    return (
      <UserBubble
        msg={msg}
        index={index}
        imgRegistry={imgRegistry}
        streaming={streaming}
        onOpenLightbox={onOpenLightbox}
        onEdit={onEdit}
      />
    );
  }
  if (msg.source === 'both') return <BothBubble msg={msg} index={index} streaming={streaming} onRegenerate={onRegenerate} isLast={isLast} />;
  return <AIBubble msg={msg} index={index} streaming={streaming} onRegenerate={onRegenerate} isLast={isLast} />;
}

function UserBubble({ msg, index, imgRegistry, streaming, onOpenLightbox, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(msg.content || '');
  const taRef = useRef(null);

  const startEdit = () => {
    setDraft(msg.content || '');
    setEditing(true);
    setTimeout(() => {
      if (taRef.current) {
        taRef.current.focus();
        taRef.current.style.height = 'auto';
        taRef.current.style.height = taRef.current.scrollHeight + 'px';
      }
    }, 0);
  };

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setEditing(false);
    onEdit(index, trimmed);
  };

  const imgs = (msg.imgIds || []).map(i => {
    const src = imgRegistry[i.id] || '';
    if (!src) return null;
    return (
      <img
        key={i.id}
        src={src}
        class="img-msg"
        data-imgid={i.id}
        alt={i.name}
        onClick={() => onOpenLightbox(src)}
      />
    );
  }).filter(Boolean);

  return (
    <div class="msg-outer">
      <div class="msg user">
        <div class="mav mav-u">You</div>
        <div class="mbub">
          {imgs.length > 0 && (
            <div style={`margin-bottom:${msg.content ? '8px' : '0'}`}>{imgs}</div>
          )}
          {editing ? (
            <div class="edit-wrap">
              <textarea
                ref={taRef}
                class="edit-ta"
                value={draft}
                onInput={e => {
                  setDraft(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); }
                  if (e.key === 'Escape') setEditing(false);
                }}
              />
              <div class="edit-acts">
                <button class="btn btn-p btn-sm" onClick={commitEdit}>Send</button>
                <button class="btn btn-g btn-sm" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            msg.content && <div dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />
          )}
        </div>
      </div>
      {!editing && (
        <div class="msg-acts">
          <button class="mact" onClick={() => navigator.clipboard.writeText(msg.content || '')}>Copy</button>
          {!streaming && <button class="mact" onClick={startEdit}>Edit</button>}
        </div>
      )}
    </div>
  );
}

function AIBubble({ msg, index, streaming, onRegenerate, isLast }) {
  const cls   = msg.source === 'claude' ? 'bc' : 'bg';
  const avCls = msg.source === 'claude' ? 'mav-c' : 'mav-g';
  const avTxt = msg.source === 'claude' ? 'C' : 'G';
  return (
    <div class="msg-outer">
      <div class="msg">
        <div class={`mav ${avCls}`}>{avTxt}</div>
        <div
          class={`mbub ${cls}`}
          dangerouslySetInnerHTML={{ __html: renderMd(msg.content || '') }}
        />
      </div>
      <div class="msg-acts">
        <button class="mact" onClick={() => navigator.clipboard.writeText(msg.content || '')}>Copy</button>
        {isLast && !streaming && (
          <button class="mact" onClick={() => onRegenerate(index)}>Retry</button>
        )}
      </div>
    </div>
  );
}

function BothBubble({ msg, index, streaming, onRegenerate, isLast }) {
  return (
    <div class="msg-outer">
      <div class="msg both">
        <div class="both-grid">
          <div class="mbub bc">
            <span class="src-lbl lbl-c">Claude</span>
            <div dangerouslySetInnerHTML={{ __html: renderMd(msg.claude || '') }} />
          </div>
          <div class="mbub bg">
            <span class="src-lbl lbl-g">ChatGPT</span>
            <div dangerouslySetInnerHTML={{ __html: renderMd(msg.gpt || '') }} />
          </div>
        </div>
      </div>
      <div class="msg-acts">
        <button class="mact" onClick={() => navigator.clipboard.writeText(msg.claude || '')}>Copy Claude</button>
        <button class="mact" onClick={() => navigator.clipboard.writeText(msg.gpt || '')}>Copy GPT</button>
        {isLast && !streaming && (
          <button class="mact" onClick={() => onRegenerate(index)}>Retry</button>
        )}
      </div>
    </div>
  );
}
