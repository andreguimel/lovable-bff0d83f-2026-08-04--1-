select cron.unschedule('guardian-health-scan');

select cron.schedule(
  'guardian-health-scan',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://project--bff0d83f-4e1c-4a72-8332-b977e96d961f.lovable.app/api/public/guardian-cron',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzd3Z1aWJjbHFwY2F1dW12bWdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MDM1NzksImV4cCI6MjEwMDk3OTU3OX0._q0aw2DEChDfHrsULbHNHXjf_FlB_MlapzjYT6T9zkk"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'flow-resume-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://project--bff0d83f-4e1c-4a72-8332-b977e96d961f.lovable.app/api/public/flow-resume',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzd3Z1aWJjbHFwY2F1dW12bWdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MDM1NzksImV4cCI6MjEwMDk3OTU3OX0._q0aw2DEChDfHrsULbHNHXjf_FlB_MlapzjYT6T9zkk"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);