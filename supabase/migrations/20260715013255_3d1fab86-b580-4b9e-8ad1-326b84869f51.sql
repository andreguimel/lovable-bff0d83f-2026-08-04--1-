ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_messages_failed
  ON public.messages (company_id, created_at DESC)
  WHERE status = 'failed';

CREATE INDEX IF NOT EXISTS idx_flow_runs_failed
  ON public.flow_runs (company_id, created_at DESC)
  WHERE status = 'failed';