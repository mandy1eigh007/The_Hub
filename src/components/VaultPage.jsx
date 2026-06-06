import { useState, useRef, useMemo } from 'preact/hooks';
import { fmtDate, buildSessionMd } from '../lib/utils.js';

const NB = { claude: 'nb-c', gpt: 'nb-g', both: 'nb-b' };
const NL = { claude: 'Claude', gpt: 'GPT', both: 'Both' };

export function VaultPage({ sessions, sortedSessions, searchIndex, dispatch }) {
  const [query,     setQuery]     = useState('');
  const [debounced, setDebounced] = useState('');
  const timerRef = useRef(null); // useRef so clearTimeout sees the same ref across renders

  const onSearch = e => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebounced(val.toLowerCase().trim()), 200);
  };

  const list = useMemo(() => {
    if (!debounced) return sortedSessions;
    const matchIds = new Set(searchIndex.filter(e => e.text.includes(debounced)).map(e => e.id));
    return sortedSessions.filter(s => matchIds.has(s.id));
  }, [debounced, sortedSessions, searchIndex]);

  // useMemo so stats don't recompute on every keystroke during search
  const stats = useMemo(() => {
    const wk = Date.now() - 7 * 86400000;
    return {
      total:  sessions.length,
      claude: sessions.filter(s => s.mode === 'claude').length,
      gpt:    sessions.filter(s => s.mode === 'gpt').length,
      both:   sessions.filter(s => s.mode === 'both').length,
      week:   sessions.filter(s => new Date(s.date) > wk).length,
    };
  }, [sessions]);

  return (
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div class="pg-top">
        <div>
          <div class="pg-title">Vault</div>
          <div class="pg-sub">
            {sessions.length} conversations{debounced ? ` · ${list.length} matching` : ''}
          </div>
        </div>
        <button
          class="btn btn-g btn-sm"
          onClick={() => {
            const out = sortedSessions.map(buildSessionMd).join('\n\n---\n\n');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([out], { type: 'text/plain' }));
            a.download = 'hub-export-' + new Date().toISOString().split('T')[0] + '.md';
            a.click();
            URL.revokeObjectURL(a.href);
            dispatch({ type: 'ADD_TOAST', msg: `Exported ${sessions.length} conversations`, toastType: 's' });
          }}
        >Export .md</button>
      </div>

      <div class="vault-body">
        <div class="stats-row">
          <div class="stat"><div class="stat-l">Total</div><div class="stat-v">{stats.total}</div></div>
          <div class="stat"><div class="stat-l">Claude</div><div class="stat-v" style="color:var(--ac2)">{stats.claude}</div></div>
          <div class="stat"><div class="stat-l">GPT</div><div class="stat-v" style="color:var(--gpt)">{stats.gpt}</div></div>
          <div class="stat"><div class="stat-l">Both</div><div class="stat-v" style="color:var(--t2)">{stats.both}</div></div>
          <div class="stat"><div class="stat-l">This week</div><div class="stat-v">{stats.week}</div></div>
        </div>

        <div class="search-box">
          <span style="font-size:12px;color:var(--t3)">🔍</span>
          <input type="text" value={query} placeholder="Search conversations…" onInput={onSearch} />
        </div>

        {list.length === 0 ? (
          <div style="display:flex;flex-direction:column;align-items:center;padding:48px 20px;gap:8px;text-align:center">
            <div style="font-size:28px;opacity:.1">⬡</div>
            <div style="font-size:13px;font-weight:700;color:var(--t2)">
              {sessions.length === 0 ? 'No conversations yet' : 'No results'}
            </div>
            <div style="font-size:11px;color:var(--t3)">
              {sessions.length === 0 ? 'Start chatting to fill your vault' : 'Try different keywords'}
            </div>
          </div>
        ) : (
          <div class="notes-grid">
            {list.map(s => (
              <NoteCard
                key={s.id}
                session={s}
                onClick={() => dispatch({ type: 'OPEN_MODAL', id: s.id })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NoteCard({ session: s, onClick }) {
  const prev = s.messages.find(m => m.role === 'user')?.content?.slice(0, 160) || '';
  return (
    <button class="nc" onClick={onClick}>
      <div class="nc-top">
        <div class="nc-title">{s.title}</div>
        <span class={`nbadge ${NB[s.mode] || 'nb-c'}`}>{NL[s.mode] || s.mode}</span>
      </div>
      <div class="nc-prev">{prev}</div>
      <div class="nc-foot">
        <span class="nc-cnt">💬 {s.messages.length} msgs{s.synced ? ' · ✓' : ''}</span>
        <span class="nc-date">{fmtDate(s.date)}</span>
      </div>
    </button>
  );
}
