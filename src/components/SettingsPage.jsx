import { useState, useEffect } from 'preact/hooks';
import { apiFetch } from '../lib/api.js';
import { buildSessionMd } from '../lib/utils.js';
import { persistPrefs } from '../lib/storage.js';

export function SettingsPage({ prefs, hasClaudeKey, hasGptKey, sessions, sortedSessions, dispatch }) {
  const [claudeKey, setClaudeKey] = useState('');
  const [gptKey,    setGptKey]    = useState('');
  const [folderId,  setFolderId]  = useState(prefs.folderId || '');
  const [sys,       setSys]       = useState(prefs.sys || '');

  // Sync input values when prefs change externally (e.g. AUTH_SUCCESS populates folderId)
  useEffect(() => { setFolderId(prefs.folderId || ''); }, [prefs.folderId]);
  useEffect(() => { setSys(prefs.sys || ''); },          [prefs.sys]);

  const toast = (msg, type = 's') => dispatch({ type: 'ADD_TOAST', msg, toastType: type });

  const saveKeys = async () => {
    if (!claudeKey && !gptKey) { toast('Enter at least one key', 'e'); return; }
    try {
      const d = await apiFetch('/api/keys', 'POST', {
        anthropicKey: claudeKey || undefined,
        openaiKey:    gptKey    || undefined,
      });
      dispatch({ type: 'SET_KEY_STATUS', claude: d.claude, gpt: d.gpt });
      setClaudeKey('');
      setGptKey('');
      toast('Keys saved ✓');
    } catch (e) { toast(e.message, 'e'); }
  };

  const testVault = async () => {
    if (!folderId) { toast('Enter a folder ID first', 'e'); return; }
    try {
      const d = await apiFetch('/api/drive/folder/' + folderId);
      toast('Connected: ' + d.name);
    } catch { toast('Folder not found — check the ID', 'e'); }
  };

  const saveVault = async () => {
    if (!folderId) { toast('Enter a folder ID', 'e'); return; }
    try {
      await apiFetch('/api/vault/folder', 'POST', { folderId });
      dispatch({ type: 'SET_PREFS', prefs: { folderId } });
      persistPrefs({ ...prefs, folderId });
      toast('Vault saved ✓');
    } catch (e) { toast('Invalid folder ID: ' + e.message, 'e'); }
  };

  const saveSys = () => {
    dispatch({ type: 'SET_PREFS', prefs: { sys } });
    persistPrefs({ ...prefs, sys });
    toast('System prompt saved ✓');
  };

  const exportAll = () => {
    const out = sortedSessions.map(buildSessionMd).join('\n\n---\n\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out], { type: 'text/plain' }));
    a.download = 'hub-export-' + new Date().toISOString().split('T')[0] + '.md';
    a.click();
            URL.revokeObjectURL(a.href);
    toast(`Exported ${sortedSessions.length} conversations`);
  };

  const clearLocal = () => {
    if (!confirm('Remove all conversations from this browser?\n\nFiles already saved to Drive are not affected.')) return;
    dispatch({ type: 'CLEAR_ALL_SESSIONS' });
    toast('Cleared', 'i');
  };

  return (
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div class="pg-top">
        <div>
          <div class="pg-title">Settings</div>
          <div class="pg-sub">API keys, vault, memory prompt</div>
        </div>
      </div>

      <div class="settings-body">

        <div class="scard">
          <div class="sch">
            <span style="font-size:14px">🤖</span>
            <div>
              <div class="sch-title">AI API Keys</div>
              <div class="sch-sub">Stored in your session — never saved on the server</div>
            </div>
          </div>
          <div class="sr">
            <div>
              <div class="sr-label">Anthropic (Claude)</div>
              <div class="sr-sub">console.anthropic.com → API Keys</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span class={`kstat ${hasClaudeKey ? 'ok' : 'no'}`}>{hasClaudeKey ? '✓ set' : 'not set'}</span>
              <input type="password" value={claudeKey} onInput={e => setClaudeKey(e.target.value)} placeholder="sk-ant-…" />
            </div>
          </div>
          <div class="sr">
            <div>
              <div class="sr-label">OpenAI (ChatGPT)</div>
              <div class="sr-sub">platform.openai.com → API Keys</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span class={`kstat ${hasGptKey ? 'ok' : 'no'}`}>{hasGptKey ? '✓ set' : 'not set'}</span>
              <input type="password" value={gptKey} onInput={e => setGptKey(e.target.value)} placeholder="sk-…" />
            </div>
          </div>
          <div class="sr">
            <div />
            <button class="btn btn-p btn-sm" onClick={saveKeys}>Save Keys</button>
          </div>
        </div>

        <div class="scard">
          <div class="sch">
            <span style="font-size:14px">📁</span>
            <div>
              <div class="sch-title">Obsidian Vault (Google Drive)</div>
              <div class="sch-sub">Every chat saves here as a .md file automatically</div>
            </div>
          </div>
          <div class="sr">
            <div>
              <div class="sr-label">Vault Folder ID</div>
              <div class="sr-sub">
                drive.google.com/drive/folders/<strong style="color:var(--ac2)">← copy this part</strong>
              </div>
            </div>
            <input type="text" value={folderId} onInput={e => setFolderId(e.target.value)}
              placeholder="1x6LXNXgRm…" style="width:190px" />
          </div>
          <div class="sr">
            <div />
            <div style="display:flex;gap:6px">
              <button class="btn btn-g btn-sm" onClick={testVault}>Test</button>
              <button class="btn btn-p btn-sm" onClick={saveVault}>Save</button>
            </div>
          </div>
        </div>

        <div class="scard">
          <div class="sch">
            <span style="font-size:14px">🧠</span>
            <div>
              <div class="sch-title">Memory / System Prompt</div>
              <div class="sch-sub">Sent to every AI every conversation — your persistent context</div>
            </div>
          </div>
          <div class="sr" style="flex-direction:column;align-items:stretch;gap:8px">
            <textarea
              rows={5}
              value={sys}
              onInput={e => setSys(e.target.value)}
              style="background:var(--s3);border:1px solid var(--b2);border-radius:var(--rsm);color:var(--t1);font-family:'JetBrains Mono',monospace;font-size:11px;padding:10px;resize:vertical;outline:none;line-height:1.7;width:100%"
              placeholder="I am Mandy, shop instructor at ANEW in Kent WA. I prefer direct answers with no fluff."
            />
            <div style="display:flex;justify-content:space-between;align-items:center">
              <button
                class="btn btn-g btn-sm"
                title="Remove auto-extracted facts, keep your manual prompt"
                onClick={() => {
                  // Strip everything after the auto-learned separator
                  const idx = sys.indexOf('// auto-learned');
                  const stripped = idx > -1 ? sys.slice(0, idx).trim() : sys;
                  setSys(stripped);
                  dispatch({ type: 'SET_PREFS', prefs: { sys: stripped } });
                  persistPrefs({ ...prefs, sys: stripped });
                  toast('Auto-learned memory cleared');
                }}
              >Clear auto-learned</button>
              <button class="btn btn-p btn-sm" onClick={saveSys}>Save</button>
            </div>
          </div>
        </div>

        <div class="scard">
          <div class="sch">
            <span style="font-size:14px">💾</span>
            <div><div class="sch-title">Data</div></div>
          </div>
          <div class="sr">
            <div>
              <div class="sr-label">Export all conversations</div>
              <div class="sr-sub">Single .md file with everything</div>
            </div>
            <button class="btn btn-g btn-sm" onClick={exportAll}>Export</button>
          </div>
          <div class="sr">
            <div>
              <div class="sr-label">Clear browser storage</div>
              <div class="sr-sub">Drive files are not affected</div>
            </div>
            <button class="btn btn-g btn-sm btn-danger" onClick={clearLocal}>Clear</button>
          </div>
        </div>

      </div>
    </div>
  );
}
