// Bump this when session schema changes to trigger a one-time migration on next load
export const STORAGE_VERSION = 3;

// Monotonic counter used to stamp _id onto messages loaded from localStorage.
// Messages created at runtime get _id from ChatPage's msgId() counter.
// Historical messages get a stable negative id so they never collide with new ones.
let _loadSeq = -1;
function loadMsgId() { return _loadSeq--; }

export function loadSessions() {
  try {
    const raw = localStorage.getItem('hub_s');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const storedV = parseInt(localStorage.getItem('hub_sv') || '0', 10);
    if (storedV < STORAGE_VERSION) {
      const migrated = parsed
        .filter(s => s && s.id && s.messages)
        .map(s => ({
          ...s,
          messages: s.messages.map(m => ({
            ...m,
            // v2→v3: stamp stable _id on every message so MessageList key={m._id} works
            _id: m._id ?? loadMsgId(),
            // v1→v2: replace inline images[] with imgIds[]
            images: undefined,
            imgIds: m.imgIds || [],
          }))
        }));
      localStorage.setItem('hub_sv', JSON.stringify(STORAGE_VERSION));
      return migrated;
    }

    // Already at current version — stamp _id on any message still missing one
    // (handles sessions saved between v2 and v3 without full migration)
    return parsed.filter(s => s && s.id && s.messages).map(s => ({
      ...s,
      messages: s.messages.map(m => ({ ...m, _id: m._id ?? loadMsgId() }))
    }));
  } catch { return []; }
}

export function loadPrefs() {
  try { return JSON.parse(localStorage.getItem('hub_p') || '{"folderId":"","sys":""}'); }
  catch { return { folderId: '', sys: '' }; }
}

export function loadDriveFileIds() {
  try { return JSON.parse(localStorage.getItem('hub_fids') || '{}'); }
  catch { return {}; }
}

export function persistSessions(sessions, driveFileIds) {
  let data = sessions;
  let serialized = JSON.stringify(data);
  // Trim oldest sessions if approaching 5MB localStorage limit
  while (serialized.length > 4_500_000 && data.length > 1) {
    data = data.slice(0, Math.floor(data.length * 0.9));
    serialized = JSON.stringify(data);
  }
  localStorage.setItem('hub_s', serialized);
  localStorage.setItem('hub_sv', JSON.stringify(STORAGE_VERSION));
  localStorage.setItem('hub_fids', JSON.stringify(driveFileIds));
}

export function persistPrefs(prefs) {
  localStorage.setItem('hub_p', JSON.stringify(prefs));
}

// Flat search index for O(n) vault search — built once, queried on every keystroke
export function buildSearchIndex(sessions) {
  return sessions.map(s => ({
    id: s.id,
    text: (s.title || '').toLowerCase() + ' ' +
      s.messages.map(m => (m.content || m.claude || m.gpt || '')).join(' ').toLowerCase()
  }));
}

export function sortSessions(sessions) {
  // ISO 8601 strings sort lexicographically — no Date construction needed
  return [...sessions].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
}
