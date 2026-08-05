
CREATE TABLE public.conversation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversation_notes_conv ON public.conversation_notes (conversation_id, created_at DESC);
CREATE INDEX idx_conversation_notes_company ON public.conversation_notes (company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_notes TO authenticated;
GRANT ALL ON public.conversation_notes TO service_role;

ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read notes in own company"
  ON public.conversation_notes FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "Members insert notes as self in own company"
  ON public.conversation_notes FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND author_id = auth.uid());

CREATE POLICY "Authors update own notes"
  ON public.conversation_notes FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND author_id = auth.uid())
  WITH CHECK (company_id = public.current_company_id() AND author_id = auth.uid());

CREATE POLICY "Authors delete own notes"
  ON public.conversation_notes FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND author_id = auth.uid());

CREATE TRIGGER set_conversation_notes_updated_at
  BEFORE UPDATE ON public.conversation_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_notes;
