CREATE TABLE IF NOT EXISTS agents_threads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent      text NOT NULL CHECK (agent IN ('claude', 'fable', 'codex', 'chatgpt')),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT agents_threads_agent_unique UNIQUE (agent)
);

CREATE TABLE IF NOT EXISTS agents_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  uuid NOT NULL REFERENCES agents_threads(id) ON DELETE CASCADE,
  agent      text NOT NULL CHECK (agent IN ('claude', 'fable', 'codex', 'chatgpt')),
  role       text NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agents_messages_thread  ON agents_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agents_messages_created ON agents_messages(created_at);

ALTER TABLE agents_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users only" ON agents_threads  FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth users only" ON agents_messages FOR ALL USING (auth.uid() IS NOT NULL);

-- Principle of least privilege: Hub uses service_role only; browser holds no Supabase key.
-- Revoke any default public/authenticated access; grant only what service_role needs.
REVOKE ALL ON agents_threads  FROM anon, authenticated;
REVOKE ALL ON agents_messages FROM anon, authenticated;

GRANT SELECT, INSERT, DELETE ON agents_threads  TO service_role;
GRANT SELECT, INSERT, DELETE ON agents_messages TO service_role;
