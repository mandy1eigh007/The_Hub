CREATE TABLE IF NOT EXISTS agents_threads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent      text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agents_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  uuid NOT NULL REFERENCES agents_threads(id) ON DELETE CASCADE,
  agent      text NOT NULL,
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

-- Explicit Data API grants required by Supabase PostgREST
GRANT SELECT, INSERT, UPDATE, DELETE ON agents_threads  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON agents_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON agents_threads  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON agents_messages TO service_role;
