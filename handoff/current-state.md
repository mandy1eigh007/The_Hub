# Current State

## Snapshot

- Project: The Hub v2
- Stack: Vite + Preact frontend, Node/Express backend
- Purpose: Google Drive-synced chat/vault app with settings, search, sessions, and media/lightbox UI
- Source origin: imported from Replit archive and flattened into the repo root
- History source: the uploaded export zip is the full available Replit history; there is no additional workspace memory to recover

## Runtime

- Dev: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`
- Server only: `npm start`
- Dev script launches Vite and `server.js` together through `concurrently`

## Environment

Expected environment variables from the setup guide:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`
- `REPLIT_URL`

## Structure

- `src/components/` contains the app screens and UI pieces
- `src/lib/` contains reducer, storage, API, and utility logic
- `server.js` is the Express backend entry point
- `dist/` is present in the archive and appears to be a committed build output

## Notes

- Nested zip artifacts were removed from the repo root.
- The repo was cleaned so the project files live directly at `/workspaces/The_Hub`.
- There is no inherited workspace memory from the Replit source, so this folder should be kept up to date.
