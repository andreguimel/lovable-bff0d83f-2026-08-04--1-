
-- ============ ONBOARDING ============
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  step_channel_created boolean NOT NULL DEFAULT false,
  step_whatsapp_connected boolean NOT NULL DEFAULT false,
  step_agent_created boolean NOT NULL DEFAULT false,
  step_first_message_sent boolean NOT NULL DEFAULT false,
  dismissed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.onboarding_progress TO authenticated;
GRANT ALL ON public.onboarding_progress TO service_role;
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own onboarding" ON public.onboarding_progress FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "Members upsert own onboarding" ON public.onboarding_progress FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "Members update own onboarding" ON public.onboarding_progress FOR UPDATE TO authenticated USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));
CREATE TRIGGER trg_onboarding_updated BEFORE UPDATE ON public.onboarding_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PLAN LIMITS ============
CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan_key text PRIMARY KEY,
  display_name text NOT NULL,
  max_channels integer NOT NULL,
  max_agents integer NOT NULL,
  max_contacts integer NOT NULL,
  max_messages_per_month integer NOT NULL,
  stripe_price_id text,
  monthly_price_cents integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plan_limits TO authenticated;
GRANT ALL ON public.plan_limits TO service_role;
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in reads plans" ON public.plan_limits FOR SELECT TO authenticated USING (true);

INSERT INTO public.plan_limits (plan_key, display_name, max_channels, max_agents, max_contacts, max_messages_per_month, monthly_price_cents, sort_order)
VALUES
  ('free', 'Free', 1, 1, 500, 1000, 0, 0),
  ('pro', 'Pro', 5, 5, 10000, 50000, 19700, 1),
  ('business', 'Business', 25, 25, 100000, 500000, 79700, 2)
ON CONFLICT (plan_key) DO NOTHING;

-- ============ SUBSCRIPTIONS ============
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_key text NOT NULL DEFAULT 'free' REFERENCES public.plan_limits(plan_key),
  status text NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own subscription" ON public.subscriptions FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed a free subscription for every existing company
INSERT INTO public.subscriptions (company_id, plan_key, status)
SELECT c.id, 'free', 'active' FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.company_id = c.id);

-- Auto-create free subscription on new company
CREATE OR REPLACE FUNCTION public.create_default_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.subscriptions (company_id, plan_key, status) VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (company_id) DO NOTHING;
  INSERT INTO public.onboarding_progress (company_id) VALUES (NEW.id)
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_company_defaults ON public.companies;
CREATE TRIGGER trg_company_defaults AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION public.create_default_subscription();

-- Backfill onboarding rows
INSERT INTO public.onboarding_progress (company_id)
SELECT c.id FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.onboarding_progress o WHERE o.company_id = c.id);

-- ============ NOTIFICATION PREFERENCES ============
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sound_enabled boolean NOT NULL DEFAULT true,
  desktop_enabled boolean NOT NULL DEFAULT true,
  email_new_conversation boolean NOT NULL DEFAULT false,
  email_transfer_received boolean NOT NULL DEFAULT true,
  email_broadcast_completed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User reads own prefs" ON public.notification_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "User inserts own prefs" ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User updates own prefs" ON public.notification_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_notif_prefs_updated BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill notification prefs for existing users
INSERT INTO public.notification_preferences (user_id)
SELECT p.id FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.notification_preferences n WHERE n.user_id = p.id);

-- ============ USAGE VIEW ============
CREATE OR REPLACE VIEW public.company_usage_current_month
WITH (security_invoker = true) AS
SELECT
  c.id AS company_id,
  (SELECT count(*) FROM public.channels ch WHERE ch.company_id = c.id) AS channel_count,
  (SELECT count(*) FROM public.ai_agents a WHERE a.company_id = c.id) AS agent_count,
  (SELECT count(*) FROM public.contacts ct WHERE ct.company_id = c.id) AS contact_count,
  (SELECT count(*) FROM public.messages m
     WHERE m.company_id = c.id
       AND m.created_at >= date_trunc('month', now())) AS messages_this_month
FROM public.companies c;
GRANT SELECT ON public.company_usage_current_month TO authenticated;
