CREATE TABLE public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL,
  label text NOT NULL DEFAULT 'Padrão',
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  webhook_url text,
  webhook_secret text,
  enabled boolean NOT NULL DEFAULT true,
  last_tested_at timestamptz,
  test_status text,
  test_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider, label)
);

CREATE INDEX idx_integrations_company_provider ON public.integrations(company_id, provider);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view company integrations"
  ON public.integrations FOR SELECT
  TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY "Admins can insert integrations"
  ON public.integrations FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_company_member(company_id)
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can update integrations"
  ON public.integrations FOR UPDATE
  TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.is_company_member(company_id)
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can delete integrations"
  ON public.integrations FOR DELETE
  TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER trg_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();