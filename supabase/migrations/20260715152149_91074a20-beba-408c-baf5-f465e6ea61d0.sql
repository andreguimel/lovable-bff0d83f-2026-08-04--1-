
-- 1. Extend ai_agents
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS specialty text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS top_p numeric,
  ADD COLUMN IF NOT EXISTS max_tokens integer,
  ADD COLUMN IF NOT EXISTS frequency_penalty numeric,
  ADD COLUMN IF NOT EXISTS presence_penalty numeric,
  ADD COLUMN IF NOT EXISTS metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

-- 2. Prompt versions
CREATE TABLE IF NOT EXISTS public.agent_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version integer NOT NULL,
  prompt text NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_prompt_versions TO authenticated;
GRANT ALL ON public.agent_prompt_versions TO service_role;
ALTER TABLE public.agent_prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prompt_versions_company" ON public.agent_prompt_versions FOR ALL TO authenticated
  USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));
CREATE INDEX IF NOT EXISTS idx_agent_prompt_versions_agent ON public.agent_prompt_versions (agent_id, created_at DESC);

-- 3. Test sessions (playground history)
CREATE TABLE IF NOT EXISTS public.agent_test_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_test_sessions TO authenticated;
GRANT ALL ON public.agent_test_sessions TO service_role;
ALTER TABLE public.agent_test_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "test_sessions_company" ON public.agent_test_sessions FOR ALL TO authenticated
  USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));
CREATE TRIGGER trg_agent_test_sessions_updated BEFORE UPDATE ON public.agent_test_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Agent logs (playground + production runs)
CREATE TABLE IF NOT EXISTS public.agent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid,
  source text NOT NULL DEFAULT 'playground',
  prompt text,
  response text,
  model text,
  tokens_in integer,
  tokens_out integer,
  latency_ms integer,
  tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_logs TO authenticated;
GRANT ALL ON public.agent_logs TO service_role;
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_logs_company" ON public.agent_logs FOR ALL TO authenticated
  USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));
CREATE INDEX IF NOT EXISTS idx_agent_logs_agent_created ON public.agent_logs (agent_id, created_at DESC);

-- 5. Knowledge docs (metadata; files in agent-knowledge bucket)
CREATE TABLE IF NOT EXISTS public.agent_knowledge_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text NOT NULL DEFAULT 'file',
  source_url text,
  storage_path text,
  size_bytes bigint,
  chunks integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ready',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_knowledge_docs TO authenticated;
GRANT ALL ON public.agent_knowledge_docs TO service_role;
ALTER TABLE public.agent_knowledge_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_docs_company" ON public.agent_knowledge_docs FOR ALL TO authenticated
  USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));
CREATE TRIGGER trg_agent_knowledge_docs_updated BEFORE UPDATE ON public.agent_knowledge_docs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Storage policies for agent-knowledge (bucket already exists)
DROP POLICY IF EXISTS "agent_knowledge_read" ON storage.objects;
CREATE POLICY "agent_knowledge_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'agent-knowledge'
    AND public.is_company_member((storage.foldername(name))[1]::uuid)
  );
DROP POLICY IF EXISTS "agent_knowledge_write" ON storage.objects;
CREATE POLICY "agent_knowledge_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'agent-knowledge'
    AND public.is_company_member((storage.foldername(name))[1]::uuid)
  );
DROP POLICY IF EXISTS "agent_knowledge_update" ON storage.objects;
CREATE POLICY "agent_knowledge_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'agent-knowledge'
    AND public.is_company_member((storage.foldername(name))[1]::uuid)
  );
DROP POLICY IF EXISTS "agent_knowledge_delete" ON storage.objects;
CREATE POLICY "agent_knowledge_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'agent-knowledge'
    AND public.is_company_member((storage.foldername(name))[1]::uuid)
  );
