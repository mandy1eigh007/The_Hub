# Repo Map

## Root

- `server.js` - Express backend entry point, auth, session storage, API routes, and static hosting.
- `index.html` - Vite HTML shell for the frontend.
- `vite.config.js` - Vite build configuration.
- `package.json` - scripts and dependency manifest.
- `SETUP.md` - Replit-focused setup and operational notes.
- `replit.nix` - Replit environment configuration.

## Frontend

- `src/main.jsx` - Preact entry point that renders the app.
- `src/components/App.jsx` - top-level app shell and route/page switcher.
- `src/components/` - UI pieces for chat, vault, settings, sidebar, modal, toasts, lightbox, header, and error boundary.
- `src/lib/reducer.js` - app state reducer and action handling.
- `src/lib/storage.js` - localStorage persistence and migration helpers.
- `src/lib/api.js` - fetch wrappers and streaming helpers.
- `src/styles.css` - application styles.

## Runtime/Data Folders

- `dist/` - built frontend output served by Express.
- `public/` - static assets for Vite.
- `sessions/` - file-backed session store used by Express session middleware.
- `attached_assets/` - uploaded assets and nested archive artifacts from the Replit export.
- `artifacts/` - additional project artifacts from the export.

## Handoff

- `handoff/README.md` - entry point for future work.
- `handoff/current-state.md` - current baseline and runtime notes.
- `handoff/architecture.md` - how the app is wired together.
- `handoff/repo-map.md` - this file.
- `handoff/environment-checklist.md` - setup and verification checklist.
- `handoff/change-log.md` - running history of changes.