-- 1) Table
CREATE TABLE IF NOT EXISTS public.guardian_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'runtime',
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  fingerprint TEXT,
  message TEXT NOT NULL,
  stack TEXT,
  route TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  diagnosis JSONB,
  fix_summary TEXT,
  requires_code_change BOOLEAN NOT NULL DEFAULT FALSE,
  occurrences INTEGER NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardian_incidents TO authenticated;
GRANT ALL ON public.guardian_incidents TO service_role;

-- 3) RLS
ALTER TABLE public.guardian_incidents ENABLE ROW LEVEL SECURITY;

-- 4) Policies: admins da empresa gerenciam; usuários da empresa podem inserir (reportar)
CREATE POLICY "Company admins manage guardian incidents"
  ON public.guardian_incidents FOR ALL
  TO authenticated
  USING (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Company members can report incidents"
  ON public.guardian_incidents FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_member(company_id));

CREATE POLICY "Company members can read incidents"
  ON public.guardian_incidents FOR SELECT
  TO authenticated
  USING (public.is_company_member(company_id));

-- 5) Indexes
CREATE INDEX IF NOT EXISTS idx_guardian_incidents_company_status
  ON public.guardian_incidents (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guardian_incidents_fingerprint
  ON public.guardian_incidents (company_id, fingerprint)
  WHERE fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guardian_incidents_open
  ON public.guardian_incidents (company_id, created_at DESC)
  WHERE status IN ('open','analyzing');

-- 6) updated_at trigger
DROP TRIGGER IF EXISTS trg_guardian_incidents_updated_at ON public.guardian_incidents;
CREATE TRIGGER trg_guardian_incidents_updated_at
  BEFORE UPDATE ON public.guardian_incidents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7) Link guardian_runs → guardian_incidents (opcional)
ALTER TABLE public.guardian_runs
  ADD COLUMN IF NOT EXISTS incident_id UUID REFERENCES public.guardian_incidents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_guardian_runs_incident
  ON public.guardian_runs (incident_id)
  WHERE incident_id IS NOT NULL;