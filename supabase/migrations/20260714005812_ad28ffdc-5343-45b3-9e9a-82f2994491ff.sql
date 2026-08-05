
-- Extend broadcast_status enum
ALTER TYPE public.broadcast_status ADD VALUE IF NOT EXISTS 'paused';
ALTER TYPE public.broadcast_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Extend broadcasts
ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rate_per_minute integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS total_recipients integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS read_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Extend broadcast_recipients
ALTER TABLE public.broadcast_recipients
  ADD COLUMN IF NOT EXISTS personalized_body text,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Unique constraint to avoid duplicate recipients per broadcast
DO $$ BEGIN
  ALTER TABLE public.broadcast_recipients
    ADD CONSTRAINT broadcast_recipients_broadcast_contact_uniq UNIQUE (broadcast_id, contact_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast ON public.broadcast_recipients(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status ON public.broadcast_recipients(broadcast_id, status);
CREATE INDEX IF NOT EXISTS idx_broadcasts_status_scheduled ON public.broadcasts(status, scheduled_at);

-- Trigger: keep aggregate counters on broadcasts in sync
CREATE OR REPLACE FUNCTION public.bump_broadcast_counters()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  b_id uuid;
BEGIN
  b_id := COALESCE(NEW.broadcast_id, OLD.broadcast_id);
  UPDATE public.broadcasts b SET
    total_recipients = (SELECT count(*) FROM public.broadcast_recipients WHERE broadcast_id = b_id),
    sent_count = (SELECT count(*) FROM public.broadcast_recipients WHERE broadcast_id = b_id AND status IN ('sent','delivered','read')),
    delivered_count = (SELECT count(*) FROM public.broadcast_recipients WHERE broadcast_id = b_id AND status IN ('delivered','read')),
    read_count = (SELECT count(*) FROM public.broadcast_recipients WHERE broadcast_id = b_id AND status = 'read'),
    failed_count = (SELECT count(*) FROM public.broadcast_recipients WHERE broadcast_id = b_id AND status = 'failed'),
    updated_at = now()
  WHERE b.id = b_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_broadcast_counters ON public.broadcast_recipients;
CREATE TRIGGER trg_bump_broadcast_counters
AFTER INSERT OR UPDATE OF status OR DELETE ON public.broadcast_recipients
FOR EACH ROW EXECUTE FUNCTION public.bump_broadcast_counters();
