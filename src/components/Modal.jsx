import { buildSessionMd, fmtDate, renderMd } from '../lib/utils.js';

export function NoteModal({ sessions, modalId, dispatch, onLoadSession }) {
  const s = sessions.find(s => s.id === modalId);
  if (!s) return null;

  const close = () => dispatch({ type: 'CLOSE_MODAL' });

  const copy = () => {
    navigator.clipboard.writeText(buildSessionMd(s))
      .then(() => dispatch({ type: 'ADD_TOAST', msg: 'Copied ✓', toastType: 's' }));
  };

  const del = () => {
    if (!confirm('Delete this conversation?')) return;
    dispatch({ type: 'DELETE_SESSION', id: modalId });
    close();
    dispatch({ type: 'ADD_TOAST', msg: 'Deleted', toastType: 'i' });
  };

  const open = () => { onLoadSession(modalId); close(); };

  return (
    <div class="mbg open" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div class="modal">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
          <div>
            <div class="modal-title">{s.title}</div>
            <div class="modal-meta">
              {s.mode.toUpperCase()} · {s.messages.length} messages · {fmtDate(s.date)}
              {s.synced ? ' · ✓ synced' : ''}
            </div>
          </div>
          <button class="btn btn-g btn-sm" onClick={close}>✕</button>
        </div>
        <div class="modal-content" dangerouslySetInnerHTML={{ __html: renderMd(buildSessionMd(s)) }} />
        <div class="modal-acts">
          <button class="btn btn-g btn-sm" onClick={copy}>Copy</button>
          <button class="btn btn-g btn-sm btn-danger" onClick={del}>Delete</button>
          <button class="btn btn-p btn-sm" onClick={open}>Open in Chat</button>
        </div>
      </div>
    </div>
  );
}
