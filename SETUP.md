# The Hub v2 — Setup Guide
Vite + Preact frontend · Node/Express backend · Google Drive sync

## What changed from v1
- Full Preact component architecture (App → Header + Sidebar + ChatPage + VaultPage + SettingsPage)
- Vite build: 57KB JS bundle, tree-shaken, production-optimized
- useReducer for all state — no global mutations
- useRef stale-closure fix on Drive save
- forwardRef streaming — textContent append during stream, single markdown parse on completion
- All previous features preserved: stop button, rename, debounced search, helmet, rate limiting, file-store sessions

## Replit setup (fresh project)

### 1. Create a Node.js Repl
- replit.com → Create Repl → Node.js
- Name it `the-hub`
- Upload everything from this zip

### 2. Google Cloud Console (~5 min)
1. console.cloud.google.com → New project → "The Hub"
2. APIs & Services → OAuth consent screen → External → add your Gmail as test user
3. Credentials → + Create → OAuth Client ID → Web application
   - Authorized redirect URI: `https://the-hub.YOURNAME.repl.co/auth/callback`
   - Copy Client ID and Client Secret
4. APIs & Services → Library → "Google Drive API" → Enable

### 3. Replit Secrets
| Key | Value |
|-----|-------|
| `GOOGLE_CLIENT_ID` | OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret |
| `SESSION_SECRET` | Any random string |
| `REPLIT_URL` | `https://the-hub.YOURNAME.repl.co` |

### 4. .replit run command (already set)
```
npm install && npm run build && node server.js
```
This installs deps, builds the Vite bundle into `dist/`, then starts Express.

### 5. Run → visit your URL → Sign in with Google

### 6. Add API keys in Settings tab
- Anthropic: console.anthropic.com → API Keys
- OpenAI: platform.openai.com → API Keys

### 7. Connect Obsidian vault
Settings → paste Google Drive folder ID → Test → Save
Get folder ID from: `drive.google.com/drive/folders/`**THIS_PART**

## Keyboard shortcuts
- `Alt+1` — Claude mode
- `Alt+2` — ChatGPT mode  
- `Alt+3` — Both mode
- `Cmd/Ctrl+K` — New chat
- `Escape` — Close modal / lightbox

## Keep it running 24/7
UptimeRobot (free) — ping your URL every 5 min to prevent Replit sleep.
