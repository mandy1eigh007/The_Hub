-- ============================================================================
-- The Hub — schema migration v3 (tasks + dumb files)
-- Run after schema_v2.sql
-- ============================================================================

-- ── hub_tasks ────────────────────────────────────────────────────────────────
create table if not exists hub_tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  notes       text,
  status      text not null default 'todo'
    check (status in ('todo','doing','done','blocked')),
  priority    text not null default 'normal'
    check (priority in ('high','normal','low')),
  project     text,
  due_date    date,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  done_at     timestamptz
);

alter table hub_tasks enable row level security;

create policy hub_tasks_all on hub_tasks for all
  using (auth.role() = 'service_role' or auth.uid() is not null)
  with check (auth.role() = 'service_role' or auth.uid() is not null);

create index if not exists hub_tasks_status_idx  on hub_tasks (status);
create index if not exists hub_tasks_project_idx on hub_tasks (project);
create index if not exists hub_tasks_created_idx on hub_tasks (created_at desc);

-- ── dumb_files (generated HTML explainers) ───────────────────────────────────
create table if not exists dumb_files (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  html       text not null,
  context    text,
  created_at timestamptz default now()
);

alter table dumb_files enable row level security;

create policy hub_dumb_files_all on dumb_files for all
  using (auth.role() = 'service_role' or auth.uid() is not null)
  with check (auth.role() = 'service_role' or auth.uid() is not null);

create index if not exists dumb_files_created_idx on dumb_files (created_at desc);
