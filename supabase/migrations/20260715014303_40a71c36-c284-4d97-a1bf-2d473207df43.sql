GRANT SELECT, INSERT ON public.guardian_runs TO authenticated;
GRANT ALL ON public.guardian_runs TO service_role;

GRANT SELECT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

GRANT SELECT, UPDATE, INSERT ON public.flow_runs TO authenticated;
GRANT ALL ON public.flow_runs TO service_role;

GRANT SELECT, UPDATE ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;

GRANT SELECT ON public.channel_events TO authenticated;
GRANT ALL ON public.channel_events TO service_role;

GRANT SELECT ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;

GRANT SELECT ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;

GRANT SELECT ON public.cascade_runs TO authenticated;
GRANT ALL ON public.cascade_runs TO service_role;

GRANT SELECT ON public.cascade_attempts TO authenticated;
GRANT ALL ON public.cascade_attempts TO service_role;

CREATE INDEX IF NOT EXISTS idx_guardian_runs_company_action_created
  ON public.guardian_runs(company_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_channels_company_status
  ON public.channels(company_id, status);

CREATE INDEX IF NOT EXISTS idx_integrations_company_status
  ON public.integrations(company_id, enabled, test_status);

CREATE INDEX IF NOT EXISTS idx_cascade_runs_company_status_created
  ON public.cascade_runs(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cascade_attempts_company_status_created
  ON public.cascade_attempts(company_id, status, created_at DESC);