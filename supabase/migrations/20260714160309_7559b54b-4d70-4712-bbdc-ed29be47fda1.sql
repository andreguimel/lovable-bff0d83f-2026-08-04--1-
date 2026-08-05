
-- Add credentials + webhook verify token on channels
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS webhook_verify_token text;

-- Provider message id for dedup + status callbacks
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS provider_message_id text;
CREATE UNIQUE INDEX IF NOT EXISTS messages_channel_provider_msg_idx
  ON public.messages (conversation_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- Presence
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- New channel event types for webhook lifecycle
ALTER TYPE public.channel_event_type ADD VALUE IF NOT EXISTS 'webhook_received';
ALTER TYPE public.channel_event_type ADD VALUE IF NOT EXISTS 'send_failed';
ALTER TYPE public.channel_event_type ADD VALUE IF NOT EXISTS 'status_delivered';
ALTER TYPE public.channel_event_type ADD VALUE IF NOT EXISTS 'status_read';

-- Message status enum may already include these; ensure they exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid=e.enumtypid WHERE t.typname='message_status' AND e.enumlabel='failed') THEN
    ALTER TYPE public.message_status ADD VALUE 'failed';
  END IF;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
