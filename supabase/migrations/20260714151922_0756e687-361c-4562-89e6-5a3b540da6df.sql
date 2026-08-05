
-- 1) Canais: fluxo de boas-vindas padrão
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS default_welcome_flow_id uuid REFERENCES public.flows(id) ON DELETE SET NULL;

-- 2) Conversas: auditoria simples da última transferência
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS transferred_from_channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transferred_at timestamptz;

-- 3) Histórico completo de transferências
CREATE TABLE IF NOT EXISTS public.conversation_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  from_channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  to_channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  flow_id uuid REFERENCES public.flows(id) ON DELETE SET NULL,
  transferred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_transfers TO authenticated;
GRANT ALL ON public.conversation_transfers TO service_role;
ALTER TABLE public.conversation_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage conversation_transfers" ON public.conversation_transfers
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
CREATE INDEX IF NOT EXISTS idx_conv_transfers_conv ON public.conversation_transfers(conversation_id, created_at DESC);

-- 4) Execuções de fluxo por conversa
CREATE TABLE IF NOT EXISTS public.flow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  current_node_id uuid REFERENCES public.flow_nodes(id) ON DELETE SET NULL,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_runs TO authenticated;
GRANT ALL ON public.flow_runs TO service_role;
ALTER TABLE public.flow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage flow_runs" ON public.flow_runs
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
CREATE INDEX IF NOT EXISTS idx_flow_runs_conv ON public.flow_runs(conversation_id, created_at DESC);
