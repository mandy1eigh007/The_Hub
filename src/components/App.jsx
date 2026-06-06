import { useReducer, useEffect, useCallback } from 'preact/hooks';
import { reducer, initialState } from '../lib/reducer.js';
import { apiFetch } from '../lib/api.js';
import { persistSessions, persistPrefs } from '../lib/storage.js';
import { Header }       from './Header.jsx';
import { Sidebar }      from './Sidebar.jsx';
import { ChatPage }     from './ChatPage.jsx';
import { VaultPage }    from './VaultPage.jsx';
import { SettingsPage } from './SettingsPage.jsx';
import { NoteModal }    from './Modal.jsx';
import { Lightbox }     from './Lightbox.jsx';
import { ToastList }    from './Toast.jsx';
import { ErrorBoundary } from './ErrorBoundary.jsx';

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const {
    authenticated, loading, user, page, mode, cur, sessions, sortedSessions,
    searchIndex, prefs, streaming, streamController, imgs, imgRegistry,
    driveFileIds, hasClaudeKey, hasGptKey, modalId, lightboxSrc, toasts, syncing,
  } = state;

  // ── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch('/auth/me').then(d => {
      if (!d.authenticated) { dispatch({ type: 'AUTH_FAIL' }); return; }
      // Merge server-persisted prefs into local prefs.
      // Server is authoritative for folderId and sys (survives cross-device login).
      // Local localStorage wins if server has nothing (first login on new device).
      let mergedPrefs = { ...prefs };
      if (d.vaultFolderId) mergedPrefs = { ...mergedPrefs, folderId: d.vaultFolderId };
      if (d.sys) mergedPrefs = { ...mergedPrefs, sys: d.sys };
      if (d.vaultFolderId || d.sys) persistPrefs(mergedPrefs);
      dispatch({ type: 'AUTH_SUCCESS', user: d.user,
        hasClaudeKey: d.hasClaudeKey, hasGptKey: d.hasGptKey, prefs: mergedPrefs });
    }).catch(e => {
      dispatch({ type: 'AUTH_FAIL' });
      const isNetwork = e.message.includes('timed out') || e.message.includes('Failed to fetch') ||
                        e.message.includes('NetworkError') || e.message.includes('Load failed');
      if (isNetwork) dispatch({ type: 'ADD_TOAST', msg: '⚠ Server unreachable — try refreshing', toastType: 'e' });
    });
  }, []);

  // Persist on every sessions/driveFileIds change regardless of active page —
  // covers delete, rename, send, and clear from any component
  useEffect(() => {
    if (authenticated) persistSessions(sessions, driveFileIds);
  }, [sessions, driveFileIds, authenticated]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = e => {
      if (e.key === 'Escape') {
        if (lightboxSrc) dispatch({ type: 'CLOSE_LIGHTBOX' });
        else if (modalId) dispatch({ type: 'CLOSE_MODAL' });
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); newChat(); }
      if (e.altKey && !e.ctrlKey && !e.metaKey && !streaming) {
        if (e.key === '1') { e.preventDefault(); dispatch({ type: 'SET_MODE', mode: 'claude' }); }
        if (e.key === '2') { e.preventDefault(); dispatch({ type: 'SET_MODE', mode: 'gpt' }); }
        if (e.key === '3') { e.preventDefault(); dispatch({ type: 'SET_MODE', mode: 'both' }); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxSrc, modalId, streaming]);

  const newChat = useCallback(() => {
    dispatch({ type: 'SET_CUR', cur: null });
    dispatch({ type: 'SHOW_PAGE', page: 'chat' });
  }, []);

  const loadSession = useCallback(id => {
    const s = sessions.find(s => s.id === id);
    if (!s) return;
    dispatch({ type: 'SET_CUR', cur: JSON.parse(JSON.stringify(s)) });
    dispatch({ type: 'SET_MODE', mode: s.mode || 'claude' });
    dispatch({ type: 'SHOW_PAGE', page: 'chat' });
  }, [sessions]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div class="loading-wrap">
        <div style="text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px">
          <div class="loading-mark">⬡</div>
          <div style="font-size:12px;color:var(--t3);font-family:'JetBrains Mono',monospace">loading...</div>
        </div>
      </div>
    );
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <>
        <div class="login-wrap">
          <div class="lcard">
            <div class="llogo">⬡</div>
            <div class="ltitle">The Hub</div>
            <div class="lsub">Claude + ChatGPT in one window.<br/>Every conversation saved to your Obsidian vault.</div>
            <ul class="lfeats">
              <li class="lf">🤖 Claude Sonnet + GPT-4o side by side</li>
              <li class="lf">🗄️ Auto-sync to Google Drive / Obsidian</li>
              <li class="lf">🔒 API keys encrypted, session persists</li>
              <li class="lf">⚡ Stop streaming · Alt+1/2/3 · ⌘K new chat</li>
            </ul>
            <a href="/auth/login" class="btn-google">
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </a>
            <p style="font-size:10px;color:var(--t3)">Only accesses Google Drive. Never reads your email.</p>
          </div>
        </div>
        <ToastList toasts={toasts} dispatch={dispatch} />
      </>
    );
  }

  const synced = cur?.synced ?? false;

  return (
    <ErrorBoundary>
      <div class="app-grid">
        <Header
          mode={mode}
          user={user}
          hasClaudeKey={hasClaudeKey}
          hasGptKey={hasGptKey}
          prefs={prefs}
          streaming={streaming}
          syncing={syncing}
          synced={synced}
          dispatch={dispatch}
        />
        <Sidebar
          page={page}
          cur={cur}
          sortedSessions={sortedSessions}
          prefs={prefs}
          dispatch={dispatch}
          onLoadSession={loadSession}
          onNewChat={newChat}
        />
        <main>
          {page === 'chat' && (
            <ChatPage
              cur={cur}
              mode={mode}
              prefs={prefs}
              streaming={streaming}
              streamController={streamController}
              imgs={imgs}
              imgRegistry={imgRegistry}
              driveFileIds={driveFileIds}
              dispatch={dispatch}
            />
          )}
          {page === 'vault' && (
            <VaultPage
              sessions={sessions}
              sortedSessions={sortedSessions}
              searchIndex={searchIndex}
              dispatch={dispatch}
            />
          )}
          {page === 'settings' && (
            <SettingsPage
              prefs={prefs}
              hasClaudeKey={hasClaudeKey}
              hasGptKey={hasGptKey}
              sessions={sessions}
              sortedSessions={sortedSessions}
              dispatch={dispatch}
            />
          )}
        </main>
      </div>
      {modalId && (
        <NoteModal
          sessions={sessions}
          modalId={modalId}
          dispatch={dispatch}
          onLoadSession={loadSession}
        />
      )}
      <Lightbox src={lightboxSrc} onClose={() => dispatch({ type: 'CLOSE_LIGHTBOX' })} />
      <ToastList toasts={toasts} dispatch={dispatch} />
    </ErrorBoundary>
  );
}
