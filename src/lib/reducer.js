import { loadSessions, loadPrefs, loadDriveFileIds, buildSearchIndex, sortSessions } from './storage.js';

export const initialState = {
  // Auth
  authenticated: false,
  loading: true,
  user: null,
  hasClaudeKey: false,
  hasGptKey: false,

  // Navigation
  page: 'chat',

  // AI mode
  mode: 'claude',

  // Sessions
  sessions: loadSessions(),
  sortedSessions: [],
  searchIndex: [],
  driveFileIds: loadDriveFileIds(),
  cur: null,

  // Streaming
  streaming: false,
  streamController: null,

  syncing: false,

  // Images
  imgs: [],
  imgRegistry: {},

  // UI
  modalId: null,
  lightboxSrc: null,
  toasts: [],

  // Preferences
  prefs: loadPrefs(),
};

function withDerived(state) {
  return {
    ...state,
    sortedSessions: sortSessions(state.sessions),
    searchIndex: buildSearchIndex(state.sessions),
  };
}

initialState.sortedSessions = sortSessions(initialState.sessions);
initialState.searchIndex    = buildSearchIndex(initialState.sessions);

export function reducer(state, action) {
  switch (action.type) {

    case 'AUTH_SUCCESS':
      return { ...state, loading: false, authenticated: true,
        user: action.user, hasClaudeKey: action.hasClaudeKey, hasGptKey: action.hasGptKey,
        prefs: action.prefs ?? state.prefs };

    case 'AUTH_FAIL':
      return { ...state, loading: false, authenticated: false };

    case 'SET_KEY_STATUS':
      return { ...state, hasClaudeKey: action.claude, hasGptKey: action.gpt };

    case 'SHOW_PAGE':
      return { ...state, page: action.page };

    case 'SET_MODE':
      return { ...state, mode: action.mode };

    case 'SET_SESSIONS':
      return withDerived({ ...state, sessions: action.sessions });

    case 'SET_CUR':
      return { ...state, cur: action.cur };

    case 'UPDATE_CUR_MESSAGES':
      if (!state.cur) return state;
      return { ...state, cur: { ...state.cur, messages: action.messages } };

    case 'PUSH_MESSAGE': {
      if (!state.cur) return state;
      const messages = [...state.cur.messages, action.message];
      const cur = { ...state.cur, messages };
      // Keep sessions[] in sync so localStorage always has current messages.
      // Without this, a tab close before Drive save loses everything sent this session.
      const sessions = state.sessions.map(s => s.id === cur.id ? { ...s, messages } : s);
      return { ...state, cur, sessions };
    }

    case 'SET_CUR_TITLE': {
      if (!state.cur) return state;
      const cur = { ...state.cur, title: action.title };
      const sessions = state.sessions.map(s => s.id === cur.id ? { ...s, title: action.title } : s);
      return withDerived({ ...state, cur, sessions });
    }

    case 'MARK_SYNCED': {
      if (!state.cur) return state;
      const cur = { ...state.cur, synced: true };
      const sessions = state.sessions.map(s => s.id === cur.id ? { ...s, synced: true } : s);
      const driveFileIds = { ...state.driveFileIds, [cur.id]: action.fileId };
      return withDerived({ ...state, cur, sessions, driveFileIds, syncing: false });
    }

    case 'SET_DRIVE_FILE_ID': {
      return { ...state, driveFileIds: { ...state.driveFileIds, [action.sessionId]: action.fileId } };
    }

    case 'DELETE_SESSION': {
      const sessions = state.sessions.filter(s => s.id !== action.id);
      const driveFileIds = { ...state.driveFileIds };
      delete driveFileIds[action.id];
      const cur = state.cur?.id === action.id ? null : state.cur;
      return withDerived({ ...state, sessions, driveFileIds, cur });
    }

    case 'RENAME_SESSION': {
      const sessions = state.sessions.map(s =>
        s.id === action.id ? { ...s, title: action.title } : s
      );
      const cur = state.cur?.id === action.id
        ? { ...state.cur, title: action.title } : state.cur;
      return withDerived({ ...state, sessions, cur });
    }

    case 'UPSERT_SESSION': {
      const exists = state.sessions.some(s => s.id === action.session.id);
      const sessions = exists
        ? state.sessions.map(s => s.id === action.session.id ? action.session : s)
        : [action.session, ...state.sessions];
      return withDerived({ ...state, sessions });
    }

    case 'CLEAR_ALL_SESSIONS':
      return withDerived({ ...state, sessions: [], driveFileIds: {}, cur: null });

    case 'TRUNCATE_MESSAGES': {
      // Slice messages up to (not including) action.fromIndex.
      // Used by edit (rewrite a user message) and regenerate (retry last response).
      if (!state.cur) return state;
      const messages = state.cur.messages.slice(0, action.fromIndex);
      const cur = { ...state.cur, messages, synced: false };
      const sessions = state.sessions.map(s => s.id === cur.id ? { ...s, messages, synced: false } : s);
      return { ...state, cur, sessions };
    }

    case 'STREAM_START':
      return { ...state, streaming: true, streamController: action.controller };

    case 'STREAM_END':
      return { ...state, streaming: false, streamController: null };

    case 'SYNC_START':
      return { ...state, syncing: true };

    case 'SYNC_END':
      return { ...state, syncing: false };

    case 'ADD_IMG': {
      const imgRegistry = { ...state.imgRegistry, [action.img.id]: action.dataUrl };
      return { ...state, imgs: [...state.imgs, action.img], imgRegistry };
    }

    case 'REMOVE_IMG': {
      const imgRegistry = { ...state.imgRegistry };
      delete imgRegistry[action.id];
      return { ...state, imgs: state.imgs.filter(i => i.id !== action.id), imgRegistry };
    }

    case 'CLEAR_IMGS': {
      // Prune every id in imgs[] from imgRegistry
      const imgRegistry = { ...state.imgRegistry };
      for (const img of state.imgs) delete imgRegistry[img.id];
      return { ...state, imgs: [], imgRegistry };
    }

    case 'OPEN_MODAL':
      return { ...state, modalId: action.id };

    case 'CLOSE_MODAL':
      return { ...state, modalId: null };

    case 'OPEN_LIGHTBOX':
      return { ...state, lightboxSrc: action.src };

    case 'CLOSE_LIGHTBOX':
      return { ...state, lightboxSrc: null };

    case 'ADD_TOAST': {
      const toast = { id: Date.now() + Math.random(), msg: action.msg, type: action.toastType };
      return { ...state, toasts: [...state.toasts, toast] };
    }

    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) };

    case 'SET_PREFS':
      return { ...state, prefs: { ...state.prefs, ...action.prefs } };

    default:
      return state;
  }
}
