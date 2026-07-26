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

---

## CF secrets (all set, production)

`SUPABASE_URL`, `HUB_SERVICE_KEY`, `OPENAI_API_KEY`, `NOTION_API_KEY`, `GITHUB_TOKEN`

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
| `/agents` | Agents | agents_threads + agents_messages — IN DESIGN (schema_v4, not yet built) |

---

## CF Functions (`functions/api/`)

`auth/`, `capture`, `chunks`, `decisions`, `github`, `imp`, `loops`, `notion`,
`projects`, `room`, `search`, `sessions`, `tail`, `tasks`, `wire`, `chatgpt/`,
`dumbfile`

All use `functions/_lib.js` helpers: `json()`, `sbFetch()`, `requireAuth()`.

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

## Recent commits (main, as of 2026-07-25)

```
85a1dbc  Add project handoff (HANDOFF.md)
a83584a  Hub v3 command center — full build (Fable + Codex reviewed)
98eae3e  fix: update Claude model to claude-sonnet-4-5
6284fb4  Import Replit export, clean workspace, and add handoff docs
82227d0  Add files via upload
```

---

## In design (not yet built)

### Agents page (`/agents`) — Codex security review complete, approved 2026-07-25

Multi-agent collaboration page: Claude, Fable, Codex, ChatGPT as direct conversation contacts.
Only the addressed agent responds. Non-secret turns are visible to Mandy in All Feed.
Secret-backed turns, filtered tool results, and agent responses from secret turns are
never injected into non-addressed agents' model context — only Mandy sees them in All Feed.

**Server-side credential tool (approved design):**
Secret slot textarea → dedicated CF Function → direct API call using the credential →
strictly filtered result returned → agent receives result only, never the credential.
Credential is never written to Supabase, never sent to any LLM.

The credential CF Function permits only server-allowlisted tools and destinations.
No arbitrary URLs, generic proxying, external MCPs, or model-selected destinations
may carry the credential. Allowlist is enforced server-side before any outbound call.

Requires: `schema_v4.sql` (agents_threads, agents_messages), `/api/agents` CF Function,
`/agents` frontend page. Mockup: `mockups/agents-page.html`.

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
