
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'pt-BR',
  ADD COLUMN IF NOT EXISTS channel_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS enabled_tools text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS greeting text,
  ADD COLUMN IF NOT EXISTS max_turns int NOT NULL DEFAULT 6;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agents TO authenticated;
GRANT ALL ON public.ai_agents TO service_role;

-- Refresh RLS policies
DROP POLICY IF EXISTS "ai_agents_company_read" ON public.ai_agents;
DROP POLICY IF EXISTS "ai_agents_admin_write" ON public.ai_agents;
DROP POLICY IF EXISTS "ai_agents_admin_update" ON public.ai_agents;
DROP POLICY IF EXISTS "ai_agents_admin_delete" ON public.ai_agents;

CREATE POLICY "ai_agents_company_read" ON public.ai_agents
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY "ai_agents_admin_insert" ON public.ai_agents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ai_agents_admin_update" ON public.ai_agents
  FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_company_member(company_id));

CREATE POLICY "ai_agents_admin_delete" ON public.ai_agents
  FOR DELETE TO authenticated
  USING (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'));

-- Runs log
CREATE TABLE IF NOT EXISTS public.ai_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  input text NOT NULL,
  output text,
  model text,
  tokens_input int,
  tokens_output int,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ai_agent_runs TO authenticated;
GRANT ALL ON public.ai_agent_runs TO service_role;

ALTER TABLE public.ai_agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_runs_company_read" ON public.ai_agent_runs
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY "agent_runs_company_insert" ON public.ai_agent_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id));

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON public.ai_agent_runs(agent_id, created_at DESC);
