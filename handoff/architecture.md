# Architecture

## Overview

The Hub is a single-page Preact app served by an Express backend. The frontend owns most UI and state transitions, while the backend handles Google OAuth, session persistence, Drive access, and AI proxying/streaming.

## Main Pieces

- `src/components/App.jsx` is the top-level shell. It bootstraps auth, wires keyboard shortcuts, persists sessions, and chooses which page to render.
- `src/lib/reducer.js` owns the app state machine. Every major UI and data transition goes through actions here.
- `src/lib/storage.js` handles `localStorage` session/prefs persistence and the derived search index.
- `src/lib/api.js` wraps REST calls and SSE stream consumption.
- `server.js` is the Express entry point. It serves `dist/`, runs auth, stores sessions on disk, and exposes API routes.

## Frontend Flow

1. `App.jsx` calls `/auth/me` on boot.
2. If the user is authenticated, the server-persisted vault folder and system prompt are merged into local prefs.
3. The reducer loads sessions and preferences from `localStorage`, then keeps UI state, current session, file IDs, and derived search data in sync.
4. Chat, vault, and settings are separate page components under `src/components/`.

## Persistence Model

- Local session data lives in `localStorage` under `hub_s`.
- Preferences live in `hub_p`.
- Google Drive file IDs live in `hub_fids`.
- Session schema versioning is tracked with `hub_sv` and migrated in `storage.js`.
- The current server session store is file-backed via `session-file-store`, so auth state and API keys survive restarts.

## Streaming Model

- `src/lib/api.js` reads server-sent events and parses them token by token.
- The backend enforces request limits with `express-rate-limit` and uses SSE for AI responses.
- The app supports stopping streams via `AbortController` and a reducer-managed `streamController`.

## Server Responsibilities

- Google OAuth login/logout and `/auth/me`.
- Encrypted API key storage in the session file using AES-256-GCM.
- Drive sync and related helper routes.
- Serving the built frontend from `dist/`.

## Working Rules

- If state shape changes, update `src/lib/storage.js` migration/versioning and note it in `change-log.md`.
- If auth, keys, or Drive sync behavior changes, update `current-state.md` and record the reason in `change-log.md`.
- If the runtime entry points change, update this file and `SETUP.md` together.

## Key Invariants

- The reducer is the source of truth for app state transitions.
- `localStorage` is the source of truth for drafts, sessions, and prefs on the client.
- The server is authoritative for OAuth session state and server-side secrets.