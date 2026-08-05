-- === Contacts: novas colunas ===
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS ai_insights jsonb DEFAULT '{}'::jsonb;

-- === Contact Tasks ===
CREATE TABLE IF NOT EXISTS public.contact_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.contact_tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  due_at timestamptz,
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_tasks_contact ON public.contact_tasks(contact_id, status);
CREATE INDEX IF NOT EXISTS idx_contact_tasks_company ON public.contact_tasks(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_tasks TO authenticated;
GRANT ALL ON public.contact_tasks TO service_role;

ALTER TABLE public.contact_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select_company" ON public.contact_tasks
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "tasks_insert_company" ON public.contact_tasks
  FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "tasks_update_company" ON public.contact_tasks
  FOR UPDATE TO authenticated USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "tasks_delete_company" ON public.contact_tasks
  FOR DELETE TO authenticated USING (public.is_company_member(company_id));

CREATE TRIGGER set_updated_at_contact_tasks
  BEFORE UPDATE ON public.contact_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- === Contact Notes ===
CREATE TABLE IF NOT EXISTS public.contact_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  pinned boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_notes_contact ON public.contact_notes(contact_id, pinned DESC, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_notes TO authenticated;
GRANT ALL ON public.contact_notes TO service_role;

ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_select_company" ON public.contact_notes
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "notes_insert_company" ON public.contact_notes
  FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "notes_update_company" ON public.contact_notes
  FOR UPDATE TO authenticated USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "notes_delete_company" ON public.contact_notes
  FOR DELETE TO authenticated USING (public.is_company_member(company_id));

CREATE TRIGGER set_updated_at_contact_notes
  BEFORE UPDATE ON public.contact_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- === Storage policies for contact-files bucket ===
CREATE POLICY "contact_files_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'contact-files');

CREATE POLICY "contact_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contact-files');

CREATE POLICY "contact_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'contact-files');
