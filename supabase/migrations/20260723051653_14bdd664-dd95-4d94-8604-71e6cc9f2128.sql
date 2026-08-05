ALTER TABLE public.flow_edges
  ADD COLUMN IF NOT EXISTS transition_delay_ms bigint NOT NULL DEFAULT 0;

ALTER TABLE public.flow_edges
  ADD CONSTRAINT flow_edges_transition_delay_nonneg CHECK (transition_delay_ms >= 0);