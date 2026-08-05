CREATE TABLE public.guardian_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  payload jsonb,
  result jsonb,
  status text NOT NULL DEFAULT 'ok',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.guardian_runs TO authenticated;
GRANT ALL ON public.guardian_runs TO service_role;

ALTER TABLE public.guardian_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read guardian runs of their company"
ON public.guardian_runs FOR SELECT TO authenticated
USING (
  public.is_company_member(company_id)
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins insert guardian runs"
ON public.guardian_runs FOR INSERT TO authenticated
WITH CHECK (
  public.is_company_member(company_id)
  AND public.has_role(auth.uid(), 'admin')
);

CREATE INDEX idx_guardian_runs_company_created ON public.guardian_runs(company_id, created_at DESC);