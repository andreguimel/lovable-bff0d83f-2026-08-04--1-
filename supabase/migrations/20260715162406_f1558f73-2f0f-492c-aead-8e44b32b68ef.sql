-- ============================================================
-- Onda 5f — Flow Studio — Fase 2: versionamento + índices
-- ============================================================

-- 1) flow_versions: sistema completo de versionamento
CREATE TABLE public.flow_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft', -- draft | published | archived
  snapshot jsonb NOT NULL, -- { flow: {...meta}, nodes: [...], edges: [...] }
  integrity_hash text NOT NULL, -- sha256 hex of snapshot
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  restored_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  restored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flow_versions_flow_version_unique UNIQUE (flow_id, version_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_versions TO authenticated;
GRANT ALL ON public.flow_versions TO service_role;

ALTER TABLE public.flow_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read flow_versions"
  ON public.flow_versions FOR SELECT
  TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "Members create flow_versions"
  ON public.flow_versions FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.current_company_id());

-- Só admin pode alterar (marcar como archived) ou apagar versões
CREATE POLICY "Admins update flow_versions"
  ON public.flow_versions FOR UPDATE
  TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins delete flow_versions"
  ON public.flow_versions FOR DELETE
  TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER trg_flow_versions_updated
  BEFORE UPDATE ON public.flow_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_flow_versions_flow_created
  ON public.flow_versions (flow_id, created_at DESC);

CREATE INDEX idx_flow_versions_company
  ON public.flow_versions (company_id, created_at DESC);

CREATE INDEX idx_flow_versions_published
  ON public.flow_versions (flow_id, published_at DESC)
  WHERE status = 'published';

-- 2) Índices que faltavam nos filhos do grafo
CREATE INDEX IF NOT EXISTS idx_flow_nodes_flow
  ON public.flow_nodes (flow_id);

CREATE INDEX IF NOT EXISTS idx_flow_edges_flow
  ON public.flow_edges (flow_id);

CREATE INDEX IF NOT EXISTS idx_flow_edges_source
  ON public.flow_edges (source_node_id);

CREATE INDEX IF NOT EXISTS idx_flow_edges_target
  ON public.flow_edges (target_node_id);

-- 3) Índice para listar fluxos por empresa por data (dashboard)
CREATE INDEX IF NOT EXISTS idx_flows_company_updated
  ON public.flows (company_id, updated_at DESC);

-- 4) helper RPC: próximo número de versão (evita race)
CREATE OR REPLACE FUNCTION public.next_flow_version_number(_flow_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(version_number), 0) + 1
  FROM public.flow_versions
  WHERE flow_id = _flow_id
$$;

GRANT EXECUTE ON FUNCTION public.next_flow_version_number(uuid) TO authenticated;