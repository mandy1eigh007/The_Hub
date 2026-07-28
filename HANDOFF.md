# The Hub — Project Handoff

**Read this before reviewing any PR or making any change.**

---

## What this project is

The Hub is Mandy's personal AI command center. It is a single-user web app
that aggregates live data from every AI tool she uses — Claude sessions,
Room (shared message log), Wire (Claude↔Codex traffic), IMP files, ChatGPT
threads, Notion, GitHub, Obsidian — into one dark-theme dashboard.

It is NOT a multi-user app. It is NOT a public product. One account, one
person, all her AI context in one place.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Hosting | Cloudflare Pages (`the-hub-d1e.pages.dev`) |
| API | Cloudflare Pages Functions (`functions/api/*`) |
| Database | Supabase — dedicated Hub instance `tzvutctcvnqzqjaxfktz` |
| Auth | Supabase email auth, proxied through CF Functions — browser holds zero Supabase keys |
| Local sync | `bridge/bridge.py` — Python daemon, runs on Mandy's machine |

---

## Security model (critical — do not break)

- The browser **never** holds a Supabase key (not even the anon key).
- All Supabase calls go through CF Functions using `HUB_SERVICE_KEY` (service_role).
- `HUB_SERVICE_KEY` lives only in Cloudflare Pages secrets and Windows user env vars.
- Auth tokens live in `localStorage` under key `hub_auth`. Pages use `apiFetch`
  from `src/lib/api.ts` which handles 401 retry + token refresh automatically.
- Dumb Files are displayed in a sandboxed iframe (no `allow-same-origin`) — null
  origin, cannot read localStorage. No same-origin windows for AI-generated HTML.
- RLS policies: `auth.uid() is not null` — service_role bypasses RLS by default.

---

## Database — Supabase project `tzvutctcvnqzqjaxfktz`

This was formerly named "LegoBlox". LegoBlox was deleted. This is now The Hub's
dedicated database with no other app's data in it.

**Migrations applied (in order):**
1. `schema.sql` — core tables: projects, sessions, chunks, decisions, open_loops,
   room_messages, imp_files, ingest_watermarks
2. `schema_v2.sql` — wire_messages, chatgpt_threads, chatgpt_messages,
   obsidian_notes, live_tail; extends room_messages with origin/turn_id/source_key
3. `schema_v3.sql` — hub_tasks, dumb_files
4. `schema_v4.sql` — agents_threads, agents_messages (deployed 2026-07-26)

---

## CF secrets (all set, production)

`SUPABASE_URL`, `HUB_SERVICE_KEY`, `OPENAI_API_KEY`, `NOTION_API_KEY`, `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`

**GitHub token:** Production `GITHUB_TOKEN` was rotated from the valid Windows
environment on 2026-07-27. Cloudflare secret presence was verified and the
current `main` deployment was redeployed so the new secret is active.

---

## Pages and what they do

| Route | Page | Data source |
|---|---|---|
| `/` | Dashboard | sessions, decisions, open_loops counts |
| `/vault` | Vault | full-text search across chunks |
| `/sessions` | Sessions | session list |
| `/sessions/:id` | Session | chunks for one session |
| `/decisions` | Decisions | decisions table |
| `/loops` | Open Loops | open_loops table |
| `/room` | Room | room_messages — 4s poll, bidirectional |
| `/wire` | Wire | wire_messages — Claude↔Codex log |
| `/tail` | Live Tail | live_tail — 3s poll, last 300 lines |
| `/imp` | IMP | imp_files — NOW/TODO/STATE tabs, editable |
| `/chat` | ChatGPT | chatgpt_threads + chatgpt_messages via OpenAI |
| `/notion` | Notion | search + page view via Notion API |
| `/github` | GitHub | PRs, repos, commits via GitHub API |
| `/tasks` | Tasks | hub_tasks — visual ADHD board, full CRUD |
| `/dumbfiles` | Dumb Files | dumb_files — GPT-4o HTML explainers |
| `/agents` | Agents | agents_threads + agents_messages — LIVE |

---

## CF Functions (`functions/api/`)

`auth/`, `agents`, `agents-secret`, `capture`, `chunks`, `decisions`, `github`, `imp`,
`loops`, `notion`, `projects`, `room`, `search`, `sessions`, `tail`, `tasks`, `wire`,
`chatgpt/`, `dumbfile`

All use `functions/_lib.js` helpers: `json()`, `sbFetch()`, `requireAuth()`.

**`summarize`** — GET `/api/summarize?source=room|tail`. Fetches the 100 most recent
messages from `room_messages` or `live_tail`, truncates each to 500 chars, and sends
them to GPT-4.1 (Chat Completions) for a 3-5 sentence plain-English summary.
Privacy boundary: every Summarize click sends up to 100 messages to OpenAI. The
instruction is in the `system` role; transcript content is in the `user` role inside
`<transcript>` delimiters to resist prompt injection. 20-second AbortController
timeout. Summaries are not stored and go stale immediately when new messages arrive.

---

## Local sync daemon (`bridge/bridge.py`)

Runs on Mandy's Windows machine. Syncs local files → Supabase every 10s (live
sources) / 60s (slow sources).

Sources: `ROOM.jsonl`, `WIRE.jsonl`, IMP files (`NOW.md`, `TODO.md`, `STATE.md`),
live tail (active Claude session), Obsidian vault (non-sensitive notes only).

Requires Windows env vars: `HUB_SERVICE_KEY`, `SUPABASE_URL`.
Optional: `OBSIDIAN_VAULT_PATH`.

Watermarks stored at `C:\imp\scripts\.bridge-watermarks.json`.

---

## Recent commits (main, as of 2026-07-27)

```
1bdcd7d  chore(deps): security upgrades - react-router v7, vite v6, wrangler v4 (#10)
949377c  docs: update Hub handoff after PRs 7 and 8 (#9)
7966147  fix(github): readable error string + suppress false empty states on error (#8)
133bad4  fix(agents): restore reasoning request for GPT-5 mini (#7)
7c807f8  fix: strip markdown code fences from GPT-4o dumb file output
5c8cfcb  feat(room,tail): scroll-hijack fix + TLDR summarize button (#6)
```

## Auto-deploy

`.github/workflows/deploy.yml` — triggers on push to main, runs `npm ci && npm run build`,
deploys `dist/` via `cloudflare/wrangler-action@v3` (Direct Upload method).

**Node requirement:** CI pins Node 22 (`actions/setup-node@v4` with `node-version: '22'`). Local dev also requires Node 22+ — wrangler 4 enforces `engines.node >=22.0.0`. `.nvmrc` is set to `22`.

Requires two GitHub Actions secrets (set in repo Settings → Secrets → Actions):
- `CLOUDFLARE_API_TOKEN` — scoped to Account / Cloudflare Pages / Edit
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID

The six Hub application secrets remain in Cloudflare Pages unchanged.

---

## Agents page (`/agents`) — LIVE

Merged in PR #5 (d8655c6). `schema_v4.sql` applied to Supabase 2026-07-26.

**What is live:**
- `agents_threads` + `agents_messages`: RLS enabled, composite FK enforces agent/thread integrity, service_role-only grants
- `/api/agents` CF Function — GET thread/all-feed, POST send+respond, DELETE clear
- `/api/agents-secret` CF Function — Secret Slot; allowlisted tools only; secret never stored or sent to LLM
- `/agents` frontend — four-agent sidebar (Claude Sonnet 4.6, Fable 5, GPT-5 mini, GPT-4.1), All feed, Secret Slot UI
- **Model note:** `gpt-5-mini` is a reasoning model; AGENTS config carries `reasoning: true` so `callOpenAI` sends `max_completion_tokens` (not `max_tokens`). Removing that flag causes a 400 from OpenAI and zero messages saved.

**Secret Slot design:**
Secret slot textarea → `/api/agents-secret` CF Function → allowlisted tool at hardcoded destination →
filtered result only returned → agent receives result only, never the credential.
Credential is never written to Supabase, never sent to any LLM, cleared from form immediately on submit.
Allowlist: `github-whoami`, `github-repos`. Add tools in `agents-secret.js` ALLOWED_TOOLS only.

---

## Known backlog (do not treat as regressions)

These pre-exist v3 and are tracked in the task list:

- 409-as-success in capture pipeline
- Watermarks advance before upload confirms
- IMP edits in the browser do not write back to disk (bridge.py is one-way: disk→DB)
- Room/Tail edge cases in polling under certain network conditions
- Tasks/DumbFiles token refresh now uses shared `apiFetch` (fixed in v3)

---

## UI rules (hard — do not violate)

- Text-only: no icons, emoji, or decorative symbols (no ✕, ▾, ▸, status dots)
- Dark theme only
- No walls of text — card-based layout
- Fonts: Barlow Condensed (headers), Inter (body), DM Mono (code)

---

## Reviewing a PR on this repo

1. Read this file first.
2. Check recent commits against this handoff — flag if state has drifted.
3. Security model is the hardest constraint. Any change that puts a Supabase key
   in the browser or creates a same-origin window with AI-generated content is a blocker.
4. RLS policies must use `auth.uid() is not null` — no `auth.role()`.
5. Text-only UI rule applies to all pages.
6. `apiFetch` from `src/lib/api.ts` is the only approved fetch wrapper.
