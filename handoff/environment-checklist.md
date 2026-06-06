# Environment Checklist

## Required Setup

- `node` and `npm` available in the workspace.
- Install dependencies with `npm install`.
- For Replit-style auth and Drive sync, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, and `REPLIT_URL`.

## Local Run

- Start the full dev stack with `npm run dev`.
- Start only the backend with `npm start`.
- Build production assets with `npm run build`.
- Preview the Vite build with `npm run preview`.

## Verification

- Confirm `src/main.jsx` renders `App` into `#root`.
- Confirm `server.js` can serve `dist/` after build.
- Confirm auth and Drive sync routes work after logging in.
- Confirm `localStorage` sessions load and persist correctly.

## Common Gotchas

- If `SESSION_SECRET` changes, encrypted session keys will no longer decrypt.
- If `REPLIT_URL` is missing in production, OAuth redirect URLs may point to localhost.
- If `dist/` is stale, rebuild before trying to launch the server.
- If the session store is cleared, saved auth state and encrypted keys are lost.