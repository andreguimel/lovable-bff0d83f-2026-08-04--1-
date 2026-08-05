ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS funnel_stage text NOT NULL DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS deal_value_cents integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_contacts_funnel_stage
  ON public.contacts(company_id, funnel_stage)
  WHERE deleted_at IS NULL;