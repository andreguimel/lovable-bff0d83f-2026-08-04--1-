CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_events_contact_created ON public.channel_events (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flow_runs_flow_started ON public.flow_runs (flow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_flow_runs_conversation ON public.flow_runs (conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_transfers_conversation ON public.conversation_transfers (conversation_id, created_at DESC);