
-- Extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Heartbeats table
CREATE TABLE IF NOT EXISTS public.scheduler_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'flow-resume',
  processed integer NOT NULL DEFAULT 0,
  resumed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  next_expected_at timestamptz,
  notes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduler_heartbeats_source_created_idx
  ON public.scheduler_heartbeats (source, created_at DESC);

GRANT ALL ON public.scheduler_heartbeats TO service_role;
ALTER TABLE public.scheduler_heartbeats ENABLE ROW LEVEL SECURITY;
-- No user-facing policies: only service_role touches this table.
