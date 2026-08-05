
CREATE TABLE public.guardian_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL,
  score integer NOT NULL,
  health jsonb NOT NULL DEFAULT '{}'::jsonb,
  incident_count integer NOT NULL DEFAULT 0,
  critical_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX guardian_health_snapshots_company_created_idx
  ON public.guardian_health_snapshots(company_id, created_at DESC);

GRANT SELECT, INSERT ON public.guardian_health_snapshots TO authenticated;
GRANT ALL ON public.guardian_health_snapshots TO service_role;

ALTER TABLE public.guardian_health_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read snapshots"
  ON public.guardian_health_snapshots
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY "Members insert snapshots"
  ON public.guardian_health_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id));
