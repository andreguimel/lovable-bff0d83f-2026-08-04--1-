
-- Runtime-02.1 (Publish Lock) — Fase 1: schema
ALTER TABLE public.flow_runs
  ADD COLUMN IF NOT EXISTS published_version_id     uuid REFERENCES public.flow_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_version_number integer,
  ADD COLUMN IF NOT EXISTS graph_hash               text;

CREATE INDEX IF NOT EXISTS idx_flow_runs_published_version
  ON public.flow_runs (published_version_id)
  WHERE published_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_flow_runs_flow_version
  ON public.flow_runs (flow_id, published_version_number DESC)
  WHERE published_version_id IS NOT NULL;
