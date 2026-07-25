-- ============================================================================
-- The Hub — schema migration v2 (command center)
-- Run in Supabase SQL Editor AFTER schema.sql is already applied.
-- Adds: chatgpt_threads, chatgpt_messages, obsidian_notes, live_tail,
--       wire_messages, and extends room_messages with origin/hub_synced_at.
-- ============================================================================

-- ── extend room_messages ────────────────────────────────────────────────────
alter table room_messages
  add column if not exists origin       text not null default 'room_file'
    check (origin in ('room_file','hub')),
  add column if not exists turn_id      numeric,
  add column if not exists hub_synced_at timestamptz,
  add column if not exists source_key  text;

create unique index if not exists room_messages_source_key_idx
  on room_messages (source_key) where source_key is not null;

-- ── wire_messages (Claude <-> Codex traffic from WIRE.jsonl) ────────────────
create table if not exists wire_messages (
  id       uuid primary key default gen_random_uuid(),
  ts       timestamptz,
  speaker  text,
  kind     text,
  re       text,
  content  text not null,
  artifact text,
  line_idx bigint unique,
  created_at timestamptz default now()
);

alter table wire_messages enable row level security;

create policy hub_wire_messages_all on wire_messages for all
  using (auth.role() = 'service_role' or auth.uid() is not null)
  with check (auth.role() = 'service_role' or auth.uid() is not null);

-- ── chatgpt_threads ──────────────────────────────────────────────────────────
create table if not exists chatgpt_threads (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete set null,
  title      text,
  created_at timestamptz default now()
);

alter table chatgpt_threads enable row level security;

create policy hub_chatgpt_threads_all on chatgpt_threads for all
  using (auth.role() = 'service_role' or auth.uid() is not null)
  with check (auth.role() = 'service_role' or auth.uid() is not null);

create index if not exists chatgpt_threads_session_idx on chatgpt_threads (session_id);
create index if not exists chatgpt_threads_created_idx on chatgpt_threads (created_at desc);

-- ── chatgpt_messages ─────────────────────────────────────────────────────────
create table if not exists chatgpt_messages (
  id        uuid primary key default gen_random_uuid(),
  thread_id uuid references chatgpt_threads(id) on delete cascade not null,
  role      text not null check (role in ('user','assistant','system')),
  content   text not null,
  model     text,
  ts        timestamptz default now()
);

alter table chatgpt_messages enable row level security;

create policy hub_chatgpt_messages_all on chatgpt_messages for all
  using (auth.role() = 'service_role' or auth.uid() is not null)
  with check (auth.role() = 'service_role' or auth.uid() is not null);

create index if not exists chatgpt_messages_thread_idx on chatgpt_messages (thread_id, ts);

-- ── obsidian_notes ───────────────────────────────────────────────────────────
create table if not exists obsidian_notes (
  id         uuid primary key default gen_random_uuid(),
  path       text unique not null,
  title      text,
  content    text,
  tags       text[],
  sha256     text,
  fts        tsvector generated always as (
    to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,''))
  ) stored,
  updated_at timestamptz default now()
);

alter table obsidian_notes enable row level security;

create policy hub_obsidian_notes_all on obsidian_notes for all
  using (auth.role() = 'service_role' or auth.uid() is not null)
  with check (auth.role() = 'service_role' or auth.uid() is not null);

create index if not exists obsidian_fts_idx on obsidian_notes using gin (fts);
create index if not exists obsidian_updated_idx on obsidian_notes (updated_at desc);

-- ── live_tail (rolling buffer of active session lines) ──────────────────────
create table if not exists live_tail (
  id           uuid primary key default gen_random_uuid(),
  session_path text not null,
  line_index   bigint not null,
  speaker      text,
  role         text,
  content      text not null,
  ts           timestamptz default now(),
  unique (session_path, line_index)
);

alter table live_tail enable row level security;

create policy hub_live_tail_all on live_tail for all
  using (auth.role() = 'service_role' or auth.uid() is not null)
  with check (auth.role() = 'service_role' or auth.uid() is not null);

create index if not exists live_tail_session_idx on live_tail (session_path, line_index desc);
create index if not exists live_tail_ts_idx on live_tail (ts desc);
