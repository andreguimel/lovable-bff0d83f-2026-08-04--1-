DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'channel_event_type'::regtype AND enumlabel = 'conversation_transferred') THEN
    ALTER TYPE public.channel_event_type ADD VALUE 'conversation_transferred';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'channel_event_type'::regtype AND enumlabel = 'flow_run_started') THEN
    ALTER TYPE public.channel_event_type ADD VALUE 'flow_run_started';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'channel_event_type'::regtype AND enumlabel = 'flow_run_completed') THEN
    ALTER TYPE public.channel_event_type ADD VALUE 'flow_run_completed';
  END IF;
END $$;

ALTER TABLE public.flow_runs ADD COLUMN IF NOT EXISTS messages_sent integer NOT NULL DEFAULT 0;