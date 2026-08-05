ALTER TABLE public.domain_events ADD COLUMN IF NOT EXISTS event_version integer NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS domain_events_type_version_idx ON public.domain_events (event_type, event_version);
CREATE INDEX IF NOT EXISTS domain_events_correlation_idx ON public.domain_events (correlation_id);