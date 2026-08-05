
-- ============================================================
-- Onda 2: Equipe operacional + auditoria + soft delete + convites
-- ============================================================

-- ---------- SOFT DELETE / ARCHIVE / STATUS ----------
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS lead_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

ALTER TABLE public.team_queues ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.team_queues ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.team_queues ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.team_queues ADD COLUMN IF NOT EXISTS strategy text NOT NULL DEFAULT 'round_robin' CHECK (strategy IN ('round_robin','least_busy','random','priority','manual'));
ALTER TABLE public.team_queues ADD COLUMN IF NOT EXISTS max_concurrent int NOT NULL DEFAULT 3;
ALTER TABLE public.team_queues ADD COLUMN IF NOT EXISTS business_hours jsonb;
ALTER TABLE public.team_queues ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

ALTER TABLE public.team_member_profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived'));
ALTER TABLE public.team_member_profiles ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE public.team_member_profiles ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

-- ---------- INVITES: tokens, expiração, status ----------
ALTER TABLE public.pending_invites ADD COLUMN IF NOT EXISTS token text UNIQUE;
ALTER TABLE public.pending_invites ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days');
ALTER TABLE public.pending_invites ADD COLUMN IF NOT EXISTS sent_count int NOT NULL DEFAULT 1;
ALTER TABLE public.pending_invites ADD COLUMN IF NOT EXISTS last_sent_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.pending_invites ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','cancelled','expired'));
ALTER TABLE public.pending_invites ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Populate tokens for existing rows
UPDATE public.pending_invites SET token = encode(gen_random_bytes(24), 'hex') WHERE token IS NULL;

-- Allow unauthenticated read by token (for /invite/$token public page)
DROP POLICY IF EXISTS "Anon can read invite by token" ON public.pending_invites;
CREATE POLICY "Anon can read invite by token"
  ON public.pending_invites FOR SELECT
  TO anon
  USING (true);
GRANT SELECT ON public.pending_invites TO anon;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_invites_updated ON public.pending_invites;
CREATE TRIGGER trg_invites_updated BEFORE UPDATE ON public.pending_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_queues_updated ON public.team_queues;
CREATE TRIGGER trg_queues_updated BEFORE UPDATE ON public.team_queues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- HISTORY (change log per entity) ----------
CREATE TABLE IF NOT EXISTS public.team_entity_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.team_entity_history TO authenticated;
GRANT ALL ON public.team_entity_history TO service_role;
ALTER TABLE public.team_entity_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "history company members"
  ON public.team_entity_history FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "history insert company"
  ON public.team_entity_history FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id));
CREATE INDEX IF NOT EXISTS idx_team_hist_entity ON public.team_entity_history(company_id, entity, entity_id, created_at DESC);

-- ---------- FEATURE FLAGS ----------
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('development','staging','production')),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, key, environment)
);
GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ff company read"
  ON public.feature_flags FOR SELECT TO authenticated
  USING (company_id IS NULL OR public.is_company_member(company_id));
CREATE POLICY "ff admin write"
  ON public.feature_flags FOR ALL TO authenticated
  USING (company_id IS NOT NULL AND public.is_company_member(company_id) AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (company_id IS NOT NULL AND public.is_company_member(company_id) AND public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS trg_ff_updated ON public.feature_flags;
CREATE TRIGGER trg_ff_updated BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- INDEXES ----------
CREATE INDEX IF NOT EXISTS idx_pending_invites_company_status ON public.pending_invites(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_invites_token ON public.pending_invites(token) WHERE token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_queues_company ON public.team_queues(company_id, archived_at, priority);
CREATE INDEX IF NOT EXISTS idx_departments_company ON public.departments(company_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_team_queue_members_queue ON public.team_queue_members(queue_id);
CREATE INDEX IF NOT EXISTS idx_team_queue_members_user ON public.team_queue_members(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_company ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_company_user ON public.user_roles(company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_team_audit_company ON public.team_audit_log(company_id, created_at DESC);

-- ---------- ACCEPT INVITE by TOKEN (function) ----------
CREATE OR REPLACE FUNCTION public.accept_invite_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
  new_role app_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação requerida';
  END IF;

  SELECT * INTO inv FROM public.pending_invites
   WHERE token = _token AND status = 'pending' AND expires_at > now()
   LIMIT 1;

  IF inv.id IS NULL THEN
    RAISE EXCEPTION 'Convite inválido ou expirado';
  END IF;

  new_role := inv.role;

  -- Update profile to company (if user has no company yet, attach)
  UPDATE public.profiles SET company_id = inv.company_id WHERE id = auth.uid();

  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (auth.uid(), inv.company_id, new_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.pending_invites SET status = 'accepted', updated_at = now() WHERE id = inv.id;

  INSERT INTO public.team_audit_log (company_id, actor_id, action, entity, entity_id, diff)
  VALUES (inv.company_id, auth.uid(), 'invite.accepted', 'invite', inv.id, jsonb_build_object('email', inv.email, 'role', inv.role));

  RETURN jsonb_build_object('ok', true, 'company_id', inv.company_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_invite_token(text) TO authenticated;
