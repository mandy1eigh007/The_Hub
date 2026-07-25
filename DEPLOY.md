# The Hub — build + deploy runbook

Stack: React 18 + TS + Vite + Tailwind on Cloudflare Pages, Pages Functions API,
Supabase (LegoBlox project `tzvutctcvnqzqjaxfktz`) for data + auth,
Python capture script on Claude Code hooks.

Secrets never appear in this repo. `HUB_SERVICE_KEY` lives in the Windows user
environment (capture) and in Cloudflare Pages secrets (API). The browser holds
no Supabase key of any kind — auth goes through the `/api/auth/*` proxy.

## 1. Apply the database schema

Supabase dashboard -> LegoBlox project -> SQL Editor -> paste `schema.sql` -> Run.
(The project must be empty first; this is a fresh install, not a migration.)

## 2. Create Mandy's auth user

Supabase dashboard -> Authentication:
1. Providers -> Email: enabled. Turn OFF "Allow new users to sign up"
   (single-user instance — this is what makes the permissive RLS policy safe).
2. Users -> Add user -> email + password (use a generated password from a
   password manager; never paste it into chat).

## 3. Install and build

```
cd C:\Users\mandy\the_hub
npm install
npm run build
```

## 4. First deploy to Cloudflare Pages

```
npx wrangler login
npx wrangler pages project create the-hub --production-branch main
npm run deploy
```

`npm run deploy` = build + `wrangler pages deploy dist --project-name the-hub`.
Functions in `/functions` deploy automatically with the site.

## 5. Set Cloudflare secrets

```
npx wrangler pages secret put SUPABASE_URL --project-name the-hub
    (value: https://tzvutctcvnqzqjaxfktz.supabase.co)
npx wrangler pages secret put HUB_SERVICE_KEY --project-name the-hub
    (value: the service role key — paste into the wrangler prompt, not chat)
```

Dashboard alternative: Cloudflare -> Workers & Pages -> the-hub -> Settings ->
Variables and Secrets -> add both as Secret, then redeploy.

## 6. Supabase Auth URL configuration

Supabase dashboard -> Authentication -> URL Configuration:
- Site URL: `https://the-hub.pages.dev` (or the custom domain once attached)

The Hub uses password grant through the server-side proxy, so no OAuth redirect
URLs are needed — Site URL is enough.

## 7. Deploy the capture script

```
copy /Y capture\capture.py C:\imp\scripts\capture.py
```

Hooks (in `~/.claude/settings.json`) must run `C:/imp/scripts/capture.ps1` on
SessionStart, Stop, and PreCompact. SessionStart matters: if a terminal is
killed, Stop never fires, and the next session start is what backfills.
Requires `HUB_SERVICE_KEY` as a Windows user env var:

```
[System.Environment]::SetEnvironmentVariable("HUB_SERVICE_KEY", "<value>", "User")
```

## 8. Verify end to end

1. Open the Pages URL -> log in with the Supabase user.
2. Run any Claude Code session, wait for a Stop hook (or run
   `powershell C:\imp\scripts\capture.ps1` by hand).
3. Dashboard shows the session; Vault search finds words from the conversation.
4. Spool check: `dir C:\imp\scripts\.capture-spool` should be empty or absent.
   `.deadletter` files there mean a batch failed 5 times — investigate before
   deleting.

## Local development

```
npm run pages:dev
```

Builds and serves the site plus Functions at http://localhost:8788. Provide the
two secrets for local runs in a `.dev.vars` file (gitignored automatically by
wrangler) or via `--binding`.
