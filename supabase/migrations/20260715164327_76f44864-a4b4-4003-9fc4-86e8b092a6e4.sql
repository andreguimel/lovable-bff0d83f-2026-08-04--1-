
-- ============ Extend flow_runs for state machine ============
ALTER TABLE public.flow_runs
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'CREATED',
  ADD COLUMN IF NOT EXISTS previous_node_id uuid,
  ADD COLUMN IF NOT EXISTS execution_stack jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS context_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS resume_at timestamptz,
  ADD COLUMN IF NOT EXISTS lock_token uuid,
  ADD COLUMN IF NOT EXISTS lock_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS dry_run boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trigger_type text,
  ADD COLUMN IF NOT EXISTS trigger_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_error jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS flow_runs_idempotency_key_uidx
  ON public.flow_runs (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS flow_runs_resume_at_idx
  ON public.flow_runs (resume_at)
  WHERE state IN ('WAITING_DELAY','RETRYING');
CREATE INDEX IF NOT EXISTS flow_runs_state_idx
  ON public.flow_runs (company_id, state);

DROP TRIGGER IF EXISTS flow_runs_updated_at ON public.flow_runs;
CREATE TRIGGER flow_runs_updated_at
  BEFORE UPDATE ON public.flow_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ flow_run_steps ============
CREATE TABLE IF NOT EXISTS public.flow_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.flow_runs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL,
  node_id uuid,
  node_type text NOT NULL,
  seq int NOT NULL,
  state text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error jsonb,
  provider text,
  provider_request jsonb,
  provider_response jsonb,
  provider_message_id text,
  http_status int,
  retry_count int NOT NULL DEFAULT 0,
  idempotency_key text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms int,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.flow_run_steps TO authenticated;
GRANT ALL ON public.flow_run_steps TO service_role;
ALTER TABLE public.flow_run_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow_run_steps company read" ON public.flow_run_steps
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "flow_run_steps company write" ON public.flow_run_steps
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "flow_run_steps company update" ON public.flow_run_steps
  FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));

CREATE INDEX IF NOT EXISTS flow_run_steps_run_seq_idx
  ON public.flow_run_steps (run_id, seq);
CREATE INDEX IF NOT EXISTS flow_run_steps_company_idx
  ON public.flow_run_steps (company_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS flow_run_steps_idem_uidx
  ON public.flow_run_steps (run_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ============ flow_events (event bus) ============
CREATE TABLE IF NOT EXISTS public.flow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.flow_runs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  flow_id uuid,
  node_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.flow_events TO authenticated;
GRANT ALL ON public.flow_events TO service_role;
ALTER TABLE public.flow_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow_events company read" ON public.flow_events
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "flow_events company insert" ON public.flow_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id));

CREATE INDEX IF NOT EXISTS flow_events_run_idx
  ON public.flow_events (run_id, created_at);
CREATE INDEX IF NOT EXISTS flow_events_company_type_idx
  ON public.flow_events (company_id, event_type, created_at DESC);

-- ============ flow_dead_letter ============
CREATE TABLE IF NOT EXISTS public.flow_dead_letter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.flow_runs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL,
  node_id uuid,
  node_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error jsonb NOT NULL,
  retry_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.flow_dead_letter TO authenticated;
GRANT ALL ON public.flow_dead_letter TO service_role;
ALTER TABLE public.flow_dead_letter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow_dead_letter company read" ON public.flow_dead_letter
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "flow_dead_letter company write" ON public.flow_dead_letter
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "flow_dead_letter admin resolve" ON public.flow_dead_letter
  FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_company_member(company_id));

DROP TRIGGER IF EXISTS flow_dead_letter_updated_at ON public.flow_dead_letter;
CREATE TRIGGER flow_dead_letter_updated_at
  BEFORE UPDATE ON public.flow_dead_letter
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS flow_dead_letter_company_status_idx
  ON public.flow_dead_letter (company_id, status, created_at DESC);

-- ============ Lock acquisition RPC ============
CREATE OR REPLACE FUNCTION public.flow_run_acquire_lock(_run_id uuid, _ttl_seconds int DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_token uuid := gen_random_uuid();
  updated int;
BEGIN
  UPDATE public.flow_runs
     SET lock_token = new_token,
         lock_expires_at = now() + make_interval(secs => _ttl_seconds)
   WHERE id = _run_id
     AND (lock_token IS NULL OR lock_expires_at < now());
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated = 0 THEN
    RETURN jsonb_build_object('acquired', false);
  END IF;
  RETURN jsonb_build_object('acquired', true, 'lock_token', new_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.flow_run_release_lock(_run_id uuid, _lock_token uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.flow_runs
     SET lock_token = NULL, lock_expires_at = NULL
   WHERE id = _run_id AND lock_token = _lock_token
   RETURNING true;
$$;

GRANT EXECUTE ON FUNCTION public.flow_run_acquire_lock(uuid,int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.flow_run_release_lock(uuid,uuid) TO authenticated, service_role;
