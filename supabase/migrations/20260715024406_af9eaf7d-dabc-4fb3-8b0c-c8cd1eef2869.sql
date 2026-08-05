CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotência: remove job anterior antes de reagendar
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'guardian-health-scan') THEN
    PERFORM cron.unschedule('guardian-health-scan');
  END IF;
END $$;

SELECT cron.schedule(
  'guardian-health-scan',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--ef9df983-c11b-4be3-afb7-c9014c9322dd.lovable.app/api/public/guardian-cron',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pYW1jcHV2cmFmaWhnbXdyaW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzA5MjYsImV4cCI6MjA5OTU0NjkyNn0.c89rf_BHBeG6I6PUOX3QHd28JWq7iGrRgz4PSzfpckM"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);