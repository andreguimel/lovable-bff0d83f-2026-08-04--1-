-- CHANNEL-ROUTING-01
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS department_id uuid NULL REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_channels_department ON public.channels(department_id) WHERE department_id IS NOT NULL;

-- Case-insensitive uniqueness for department names within a tenant (active/non-archived only)
CREATE UNIQUE INDEX IF NOT EXISTS ux_departments_company_name_ci
  ON public.departments (company_id, lower(name))
  WHERE archived_at IS NULL;