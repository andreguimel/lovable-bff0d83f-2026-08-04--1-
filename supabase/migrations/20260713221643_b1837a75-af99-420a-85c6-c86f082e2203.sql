
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_company_active
  ON public.contacts(company_id) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_company_phone_active
  ON public.contacts(company_id, phone) WHERE deleted_at IS NULL AND phone IS NOT NULL;
