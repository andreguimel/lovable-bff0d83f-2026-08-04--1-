
-- 1. Extend channel_events with contact/conversation refs + new event types
ALTER TABLE public.channel_events
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS channel_events_contact_created_idx
  ON public.channel_events (contact_id, created_at DESC)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS channel_events_company_contact_idx
  ON public.channel_events (company_id, contact_id, created_at DESC)
  WHERE contact_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'channel_event_type'::regtype AND enumlabel = 'email_sent') THEN
    ALTER TYPE channel_event_type ADD VALUE 'email_sent';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'channel_event_type'::regtype AND enumlabel = 'cascade_started') THEN
    ALTER TYPE channel_event_type ADD VALUE 'cascade_started';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'channel_event_type'::regtype AND enumlabel = 'cascade_step_sent') THEN
    ALTER TYPE channel_event_type ADD VALUE 'cascade_step_sent';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'channel_event_type'::regtype AND enumlabel = 'cascade_completed') THEN
    ALTER TYPE channel_event_type ADD VALUE 'cascade_completed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'channel_event_type'::regtype AND enumlabel = 'cascade_cancelled') THEN
    ALTER TYPE channel_event_type ADD VALUE 'cascade_cancelled';
  END IF;
END$$;

-- 2. cascade_policies
CREATE TABLE IF NOT EXISTS public.cascade_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cascade_policies TO authenticated;
GRANT ALL ON public.cascade_policies TO service_role;
ALTER TABLE public.cascade_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage cascade_policies" ON public.cascade_policies
  FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE TRIGGER trg_cascade_policies_updated BEFORE UPDATE ON public.cascade_policies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS cascade_policies_company_idx ON public.cascade_policies (company_id);

-- 3. cascade_runs
CREATE TABLE IF NOT EXISTS public.cascade_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.cascade_policies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running',
  current_step int NOT NULL DEFAULT 0,
  run_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cascade_runs TO authenticated;
GRANT ALL ON public.cascade_runs TO service_role;
ALTER TABLE public.cascade_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage cascade_runs" ON public.cascade_runs
  FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE TRIGGER trg_cascade_runs_updated BEFORE UPDATE ON public.cascade_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS cascade_runs_due_idx ON public.cascade_runs (status, run_at);
CREATE INDEX IF NOT EXISTS cascade_runs_contact_idx ON public.cascade_runs (contact_id, created_at DESC);

-- 4. cascade_attempts
CREATE TABLE IF NOT EXISTS public.cascade_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.cascade_runs(id) ON DELETE CASCADE,
  step_index int NOT NULL,
  channel_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cascade_attempts TO authenticated;
GRANT ALL ON public.cascade_attempts TO service_role;
ALTER TABLE public.cascade_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage cascade_attempts" ON public.cascade_attempts
  FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE INDEX IF NOT EXISTS cascade_attempts_run_idx ON public.cascade_attempts (run_id, step_index);
