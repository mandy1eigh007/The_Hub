import { useState, useRef } from 'preact/hooks';
import { fmtDate, buildSessionMd } from '../lib/utils.js';

const SRC_CLS = { claude: 'hsc', gpt: 'hsg', both: 'hsb' };
const SRC_LBL = { claude: 'C',   gpt: 'G',   both: '⚡' };

export function Sidebar({ page, cur, sortedSessions, prefs, dispatch, onLoadSession, onNewChat }) {
  return (
    <aside>
      <div class="sb-top">
        <div style="display:flex;flex-direction:column;gap:3px">
          <NavItem id="chat"     icon="💬" label="Chat"     page={page} dispatch={dispatch} />
          <NavItem id="vault"    icon="🗄️" label="Vault"    page={page} dispatch={dispatch}
            badge={sortedSessions.length} />
          <NavItem id="settings" icon="⚙️" label="Settings" page={page} dispatch={dispatch} />
        </div>
        <div style="margin-top:8px">
          <button
            class="btn btn-g btn-sm"
            style="width:100%;justify-content:center"
            onClick={onNewChat}
          >
            + New Chat
          </button>
        </div>
      </div>

      <div class="sbdiv" />

      <div style="padding:0 8px 6px;flex-shrink:0">
        <div class="sb-sect-label">Recent</div>
      </div>

      <div class="sb-hist">
        {sortedSessions.length === 0
          ? <div style="padding:8px;font-size:11px;color:var(--t3)">No chats yet — start one above</div>
          : sortedSessions.slice(0, 50).map(s => (
            <HistoryItem
              key={s.id}
              session={s}
              active={cur?.id === s.id}
              onLoad={() => onLoadSession(s.id)}
              onDelete={e => {
                e.stopPropagation();
                dispatch({ type: 'DELETE_SESSION', id: s.id });
                dispatch({ type: 'ADD_TOAST', msg: 'Chat deleted', toastType: 'i' });
              }}
              onRename={title => dispatch({ type: 'RENAME_SESSION', id: s.id, title })}
            />
          ))
        }
      </div>

      <div class="sb-bottom">
        <div class="sb-info">{prefs.folderId ? 'syncing to drive' : 'local only'}</div>
        <button
          class="btn btn-g btn-sm"
          title="Export all as markdown"
          onClick={() => {
            const out = sortedSessions.map(buildSessionMd).join('\n\n---\n\n');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([out], { type: 'text/plain' }));
            a.download = 'hub-export-' + new Date().toISOString().split('T')[0] + '.md';
            a.click();
            URL.revokeObjectURL(a.href);
            dispatch({ type: 'ADD_TOAST', msg: `Exported ${sortedSessions.length} conversations`, toastType: 's' });
          }}
        >↓</button>
      </div>
    </aside>
  );
}

function NavItem({ id, icon, label, page, dispatch, badge }) {
  return (
    <button
      class={`ni${page === id ? ' active' : ''}`}
      onClick={() => dispatch({ type: 'SHOW_PAGE', page: id })}
    >
      <span class="ni-ic">{icon}</span>
      {label}
      {badge !== undefined && (
        <span class="ni-badge">{badge}</span>
      )}
    </button>
  );
}

function HistoryItem({ session: s, active, onLoad, onDelete, onRename }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(s.title);
  const inputRef  = useRef(null);
  // cancelRef prevents onBlur from committing the rename when Escape is pressed.
  // In browsers, onKeyDown fires before onBlur — without this flag, Escape sets
  // renaming=false then onBlur fires and calls commitRename with the edited draft.
  const cancelRef = useRef(false);

  const startRename = e => {
    e.stopPropagation();
    setDraft(s.title);
    cancelRef.current = false;
    setRenaming(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitRename = () => {
    if (cancelRef.current) { cancelRef.current = false; return; }
    const title = draft.trim() || s.title;
    setRenaming(false);
    if (title !== s.title) onRename(title);
  };

  return (
    <button
      class={`hi${active ? ' active' : ''}`}
      onClick={renaming ? undefined : onLoad}
      onDblClick={startRename}
    >
      <div class={`hi-src ${SRC_CLS[s.mode] || 'hsc'}`}>
        {SRC_LBL[s.mode] || 'C'}
      </div>
      <div class="hi-info">
        {renaming ? (
          <input
            ref={inputRef}
            class="hi-title-edit"
            value={draft}
            onInput={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
              if (e.key === 'Escape') { cancelRef.current = true; setRenaming(false); }
              e.stopPropagation();
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <div class="hi-title">{s.title}</div>
        )}
        <div class="hi-meta">{fmtDate(s.date)} · {s.messages.length} msgs</div>
      </div>
      {!renaming && (
        <button class="hi-del" onClick={onDelete}>✕</button>
      )}
    </button>
  );
}
