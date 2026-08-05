DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'channel_event_type'::regtype AND enumlabel = 'conversation_assigned') THEN
    ALTER TYPE public.channel_event_type ADD VALUE 'conversation_assigned';
  END IF;
END $$;