-- ============================================================================
-- The Hub — complete schema
-- Target: The Hub database (tzvutctcvnqzqjaxfktz) — dedicated Supabase instance.
-- Run once in the Supabase SQL editor (or via supabase MCP apply_migration).
--
-- Access model:
--   * The capture script and Cloudflare Functions use the service role key
--     (bypasses RLS by design).
--   * RLS is enabled on every table anyway; policies allow only the service
--     role or an authenticated user (single-user instance: Mandy).
--   * The browser never holds a data-capable key — all reads go through
--     Cloudflare Functions.
-- ============================================================================

create extension if not exists vector;

-- ── projects ────────────────────────────────────────────────────────────────
create table projects (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text,
  created_at timestamptz default now()
);

-- ── sessions ────────────────────────────────────────────────────────────────
-- id comes from the Claude Code transcript filename UUID when available.
create table sessions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references projects(id) on delete set null,
  agent           text,
  transcript_path text,
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz default now()
);

-- ── chunks (the spine — actively written by capture.py) ─────────────────────
create table chunks (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid references sessions(id) on delete set null,
  project_id   uuid references projects(id) on delete set null,
  source_type  text check (source_type in ('transcript','imp','room','notion')),
  source_ref   jsonb,
  speaker      text check (speaker in ('mandy','claude','codex','fable','chatgpt','system')),
  content      text not null,
  content_hash text unique not null,
  ts           timestamptz,
  sensitivity  int default 1 check (sensitivity between 1 and 4),
  fts          tsvector generated always as (to_tsvector('english', content)) stored,
  embedding    vector(768),
  created_at   timestamptz default now()
);

-- ── decisions (aspirational: no automated producer yet; written manually
--    or by a future extraction pass — schema is ready, UI reads it) ─────────
create table decisions (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  content    text not null,
  accepted   boolean,
  ts         timestamptz,
  created_at timestamptz default now()
);

-- ── open_loops (aspirational: same status as decisions) ─────────────────────
create table open_loops (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  content    text not null,
  resolved   boolean default false,
  ts         timestamptz,
  created_at timestamptz default now()
);

-- ── room_messages (aspirational: producer is the future multi-agent room) ──
create table room_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete set null,
  speaker    text check (speaker in ('mandy','claude','codex','fable','chatgpt','system')),
  content    text not null,
  ts         timestamptz,
  created_at timestamptz default now()
);

-- ── imp_files (aspirational: future IMP mirror sync) ────────────────────────
create table imp_files (
  id          uuid primary key default gen_random_uuid(),
  path        text unique not null,
  content     text,
  sha256      text,
  sensitivity int default 1 check (sensitivity between 1 and 4),
  updated_at  timestamptz default now()
);

-- ── ingest_watermarks (actively written by capture.py) ──────────────────────
create table ingest_watermarks (
  source_key  text primary key,
  byte_offset bigint default 0,
  updated_at  timestamptz default now()
);

-- ── indexes ─────────────────────────────────────────────────────────────────
create index chunks_fts_idx     on chunks using gin (fts);
create index chunks_ts_idx      on chunks (ts);
create index chunks_session_idx on chunks (session_id);
create index chunks_project_idx on chunks (project_id);
-- content_hash UNIQUE constraint above already provides the unique index
-- (chunks_content_hash_key) that on_conflict=content_hash upserts rely on.

create index sessions_project_idx   on sessions (project_id);
create index sessions_started_idx   on sessions (started_at);
create index decisions_project_idx  on decisions (project_id);
create index decisions_ts_idx       on decisions (ts);
create index open_loops_project_idx on open_loops (project_id);
create index open_loops_resolved_idx on open_loops (resolved);
create index room_messages_session_idx on room_messages (session_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Single-user instance. Service role bypasses RLS; the policy additionally
-- admits any authenticated user (only Mandy's account exists — signups are
-- disabled in Supabase Auth settings, which is what makes this safe).
alter table projects          enable row level security;
alter table sessions          enable row level security;
alter table chunks            enable row level security;
alter table decisions         enable row level security;
alter table open_loops        enable row level security;
alter table room_messages     enable row level security;
alter table imp_files         enable row level security;
alter table ingest_watermarks enable row level security;

create policy hub_projects_all on projects for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy hub_sessions_all on sessions for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy hub_chunks_all on chunks for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy hub_decisions_all on decisions for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy hub_open_loops_all on open_loops for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy hub_room_messages_all on room_messages for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy hub_imp_files_all on imp_files for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy hub_ingest_watermarks_all on ingest_watermarks for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
