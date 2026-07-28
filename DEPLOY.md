# The Hub — build + deploy runbook (v3 command center)

Stack: React 18 + TS + Vite + Tailwind on Cloudflare Pages, Pages Functions API,
Supabase (The Hub database `tzvutctcvnqzqjaxfktz` — dedicated instance, formerly named LegoBlox) for data + auth,
Python capture + bridge scripts on Claude Code hooks and local scheduler.

Secrets never appear in this repo. Keys live in Windows user env vars (capture/bridge)
and Cloudflare Pages secrets (API). The browser holds no Supabase key of any kind.

---

## 1. Apply schema (first install only)

Supabase dashboard -> The Hub database -> SQL Editor:
1. Run `schema.sql` — creates core tables with RLS policies.
2. Run `schema_v2.sql` — adds Room, Wire, ChatGPT, Obsidian, live_tail tables.
3. Run `schema_v3.sql` — adds hub_tasks and dumb_files tables.

---

## 2. Supabase auth setup (first install only)

Authentication -> Providers -> Email:
- Enable email sign-in.
- Turn OFF "Allow new users to sign up".

Authentication -> Users -> Add user -> email + password.

Authentication -> URL Configuration:
- Site URL: `https://the-hub-d1e.pages.dev` (or custom domain).

---

## 3. Install and build

```
cd C:\Users\mandy\the_hub
npm install
npm run build
```

---

## 4. Deploy to Cloudflare Pages

```
npm run deploy
```

(`npm run deploy` = build + `wrangler pages deploy dist --project-name the-hub`)

---

## 5. Set Cloudflare secrets

Core (required for all API routes):
```
npx wrangler pages secret put SUPABASE_URL --project-name the-hub
    (value: https://tzvutctcvnqzqjaxfktz.supabase.co)
npx wrangler pages secret put HUB_SERVICE_KEY --project-name the-hub
    (value: hub_db service_role key from vault.json)
```

Connectors (required for ChatGPT, Notion, GitHub pages):
```
npx wrangler pages secret put OPENAI_API_KEY --project-name the-hub
    (value: OPENAI_API_KEY_HUB from vault.json)
npx wrangler pages secret put NOTION_API_KEY --project-name the-hub
    (value: NOTION_API_KEY from vault.json)
npx wrangler pages secret put GITHUB_TOKEN --project-name the-hub
    (value: GITHUB_TOKEN from vault.json)
```

Dashboard alternative: Cloudflare -> Workers & Pages -> the-hub -> Settings ->
Variables and Secrets -> add as Secret, then redeploy.

---

## 6. Deploy bridge.py (local sync daemon)

```
copy /Y C:\Users\mandy\the_hub\bridge\bridge.py C:\imp\scripts\bridge.py
```

Set required env var (already done if HUB_SERVICE_KEY is set):
```powershell
[System.Environment]::SetEnvironmentVariable("HUB_SERVICE_KEY", "<service_role_key>", "User")
```

Run manually (one pass):
```
python C:\imp\scripts\bridge.py --once
```

Run continuously:
```
python C:\imp\scripts\bridge.py
```

Optional: Obsidian sync — set vault path before running:
```powershell
[System.Environment]::SetEnvironmentVariable("OBSIDIAN_VAULT_PATH", "C:\path\to\vault", "User")
```

Schedule (runs at logon):
```powershell
$action  = New-ScheduledTaskAction -Execute "python" -Argument "C:\imp\scripts\bridge.py"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "HubBridge" -Action $action -Trigger $trigger -RunLevel Highest
```

---

## 7. Hooks (capture.ps1 — already configured from v2)

`C:\Users\mandy\.claude\settings.json` hooks run `capture.ps1` on:
- SessionStart
- Stop
- PreCompact

These handle transcript capture. Bridge.py handles Room, IMP, Tail, Obsidian.

---

## 8. Verify end to end

1. Open the Pages URL -> log in.
2. Dashboard: recent sessions should show after capture.py runs.
3. Room: run `python bridge.py --once --source room` — Room messages should appear.
4. IMP: run `python bridge.py --once --source imp` — NOW/TODO/STATE tabs populate.
5. Tail: start a Claude session, run `python bridge.py --once --source tail` — lines appear.
6. Chat: type a message -> ChatGPT responds (OPENAI_API_KEY must be set in CF).
7. Notion: search any term -> results from your workspace.
8. GitHub: Open PRs tab shows your open pull requests.

---

## Local development

> **Requires Node 22+.** Wrangler 4 enforces `engines.node >=22.0.0`. Run `node -v` before starting; use `nvm use 22` or install from nodejs.org if needed.

```
npm run pages:dev
```

Serves site + Functions at http://localhost:8788.
Create `.dev.vars` with secrets for local runs (gitignored by wrangler):
```
SUPABASE_URL=https://tzvutctcvnqzqjaxfktz.supabase.co
HUB_SERVICE_KEY=<service_role_key>
OPENAI_API_KEY=<hub_openai_key>
NOTION_API_KEY=<notion_key>
GITHUB_TOKEN=<github_pat>
```
