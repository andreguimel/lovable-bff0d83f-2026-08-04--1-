-- Phase 3 — Enrichment: enable Realtime for suggestions, runs, and history.
ALTER TABLE public.contact_enrichment_suggestions REPLICA IDENTITY FULL;
ALTER TABLE public.contact_enrichment_runs REPLICA IDENTITY FULL;
ALTER TABLE public.contact_enrichment_history REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_enrichment_suggestions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_enrichment_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_enrichment_history;