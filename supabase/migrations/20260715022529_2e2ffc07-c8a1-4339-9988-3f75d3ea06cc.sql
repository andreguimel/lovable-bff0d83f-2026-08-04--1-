ALTER TABLE public.guardian_incidents REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.guardian_incidents;