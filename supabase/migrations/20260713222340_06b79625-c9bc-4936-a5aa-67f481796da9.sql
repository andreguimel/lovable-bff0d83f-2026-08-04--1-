
-- Extend channels table
DO $$ BEGIN
  CREATE TYPE public.channel_provider AS ENUM ('whatsapp_cloud', 'whatsapp_business', 'baileys', 'evolution');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.routing_strategy AS ENUM ('round_robin', 'least_busy', 'best_conversion', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.channel_event_type AS ENUM ('connected','disconnected','qr_generated','error','message_sent','message_received','rate_limited','paused','resumed','test_sent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS provider_type public.channel_provider DEFAULT 'whatsapp_cloud',
  ADD COLUMN IF NOT EXISTS business_hours jsonb DEFAULT '{"enabled":false,"tz":"America/Sao_Paulo","days":{}}'::jsonb,
  ADD COLUMN IF NOT EXISTS off_hours_message text,
  ADD COLUMN IF NOT EXISTS auto_reply_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routing_strategy public.routing_strategy NOT NULL DEFAULT 'round_robin',
  ADD COLUMN IF NOT EXISTS qr_code text,
  ADD COLUMN IF NOT EXISTS qr_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_data jsonb,
  ADD COLUMN IF NOT EXISTS last_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS daily_message_limit int NOT NULL DEFAULT 1000;

-- channel_events
CREATE TABLE IF NOT EXISTS public.channel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  event_type public.channel_event_type NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_events TO authenticated;
GRANT ALL ON public.channel_events TO service_role;
ALTER TABLE public.channel_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "channel_events company access" ON public.channel_events;
CREATE POLICY "channel_events company access" ON public.channel_events
  FOR ALL TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));
CREATE INDEX IF NOT EXISTS channel_events_channel_created_idx ON public.channel_events(channel_id, created_at DESC);

-- channel_metrics_daily
CREATE TABLE IF NOT EXISTS public.channel_metrics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  date date NOT NULL,
  messages_sent int NOT NULL DEFAULT 0,
  messages_received int NOT NULL DEFAULT 0,
  conversations_opened int NOT NULL DEFAULT 0,
  UNIQUE(channel_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_metrics_daily TO authenticated;
GRANT ALL ON public.channel_metrics_daily TO service_role;
ALTER TABLE public.channel_metrics_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "channel_metrics company access" ON public.channel_metrics_daily;
CREATE POLICY "channel_metrics company access" ON public.channel_metrics_daily
  FOR ALL TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));
CREATE INDEX IF NOT EXISTS channel_metrics_channel_date_idx ON public.channel_metrics_daily(channel_id, date DESC);

-- Trigger: bump metrics on message insert
CREATE OR REPLACE FUNCTION public.bump_channel_metrics()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ch_id uuid;
  co_id uuid;
BEGIN
  SELECT channel_id, company_id INTO ch_id, co_id
  FROM public.conversations WHERE id = NEW.conversation_id;
  IF ch_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.channel_metrics_daily(company_id, channel_id, date, messages_sent, messages_received)
  VALUES (
    co_id, ch_id, (NEW.created_at AT TIME ZONE 'UTC')::date,
    CASE WHEN NEW.direction = 'outbound' THEN 1 ELSE 0 END,
    CASE WHEN NEW.direction = 'inbound' THEN 1 ELSE 0 END
  )
  ON CONFLICT (channel_id, date) DO UPDATE SET
    messages_sent = public.channel_metrics_daily.messages_sent + EXCLUDED.messages_sent,
    messages_received = public.channel_metrics_daily.messages_received + EXCLUDED.messages_received;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bump_channel_metrics_trg ON public.messages;
CREATE TRIGGER bump_channel_metrics_trg
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.bump_channel_metrics();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_events;
