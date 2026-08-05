
-- =====================================================
-- ONDA 2 — FUNDAÇÃO PLATAFORMA
-- RBAC granular + Feature Flags ricas + Member overrides
-- Audit correlation + Entity history versionado + Domain events
-- =====================================================

-- ============ 1. PERMISSIONS REGISTRY ============
CREATE TABLE IF NOT EXISTS public.permissions (
  key TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions readable by all authenticated"
  ON public.permissions FOR SELECT TO authenticated USING (true);

-- Seed permissions matrix
INSERT INTO public.permissions (key, module, action, label, description) VALUES
  -- CRM
  ('crm.view', 'crm', 'view', 'Visualizar CRM', 'Ver contatos e negócios'),
  ('crm.create', 'crm', 'create', 'Criar em CRM', 'Criar contatos e negócios'),
  ('crm.edit', 'crm', 'edit', 'Editar CRM', 'Editar contatos e negócios'),
  ('crm.delete', 'crm', 'delete', 'Excluir CRM', 'Excluir registros do CRM'),
  ('crm.export', 'crm', 'export', 'Exportar CRM', 'Exportar dados do CRM'),
  -- Inbox
  ('inbox.view', 'inbox', 'view', 'Visualizar Inbox', 'Ver conversas'),
  ('inbox.respond', 'inbox', 'respond', 'Responder', 'Enviar mensagens'),
  ('inbox.transfer', 'inbox', 'transfer', 'Transferir', 'Transferir conversas'),
  ('inbox.close', 'inbox', 'close', 'Encerrar', 'Encerrar conversas'),
  ('inbox.delete', 'inbox', 'delete', 'Excluir', 'Excluir conversas'),
  -- Fluxos
  ('flows.view', 'flows', 'view', 'Visualizar Fluxos', 'Ver fluxos'),
  ('flows.create', 'flows', 'create', 'Criar Fluxos', 'Criar novos fluxos'),
  ('flows.edit', 'flows', 'edit', 'Editar Fluxos', 'Editar fluxos'),
  ('flows.publish', 'flows', 'publish', 'Publicar Fluxos', 'Publicar versões'),
  ('flows.delete', 'flows', 'delete', 'Excluir Fluxos', 'Remover fluxos'),
  -- Agentes IA
  ('agents.view', 'agents', 'view', 'Visualizar Agentes', 'Ver agentes'),
  ('agents.create', 'agents', 'create', 'Criar Agentes', 'Criar agentes IA'),
  ('agents.edit', 'agents', 'edit', 'Editar Agentes', 'Editar agentes'),
  ('agents.execute', 'agents', 'execute', 'Executar Agentes', 'Executar agentes'),
  ('agents.train', 'agents', 'train', 'Treinar Agentes', 'Treinar knowledge base'),
  ('agents.delete', 'agents', 'delete', 'Excluir Agentes', 'Remover agentes'),
  -- Campanhas
  ('campaigns.view', 'campaigns', 'view', 'Visualizar Campanhas', ''),
  ('campaigns.create', 'campaigns', 'create', 'Criar Campanhas', ''),
  ('campaigns.send', 'campaigns', 'send', 'Enviar Campanhas', ''),
  ('campaigns.delete', 'campaigns', 'delete', 'Excluir Campanhas', ''),
  -- Canais
  ('channels.view', 'channels', 'view', 'Visualizar Canais', ''),
  ('channels.create', 'channels', 'create', 'Criar Canais', ''),
  ('channels.edit', 'channels', 'edit', 'Editar Canais', ''),
  ('channels.delete', 'channels', 'delete', 'Excluir Canais', ''),
  -- Equipe
  ('team.view', 'team', 'view', 'Visualizar Equipe', ''),
  ('team.invite', 'team', 'invite', 'Convidar Membros', ''),
  ('team.edit', 'team', 'edit', 'Editar Membros', ''),
  ('team.manage_roles', 'team', 'manage_roles', 'Gerenciar Permissões', 'Editar matriz RBAC'),
  ('team.remove', 'team', 'remove', 'Remover Membros', ''),
  -- Guardião
  ('guardian.view', 'guardian', 'view', 'Visualizar Guardião', ''),
  ('guardian.resolve', 'guardian', 'resolve', 'Resolver Incidentes', ''),
  -- Settings
  ('settings.view', 'settings', 'view', 'Visualizar Configurações', ''),
  ('settings.edit', 'settings', 'edit', 'Editar Configurações', ''),
  ('settings.feature_flags', 'settings', 'feature_flags', 'Gerenciar Feature Flags', '')
ON CONFLICT (key) DO NOTHING;

-- ============ 2. ROLE PERMISSIONS ============
CREATE TABLE IF NOT EXISTS public.role_permissions_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  granted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, role, permission_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions_v2 TO authenticated;
GRANT ALL ON public.role_permissions_v2 TO service_role;
ALTER TABLE public.role_permissions_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions_v2 members read"
  ON public.role_permissions_v2 FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "role_permissions_v2 admins write"
  ON public.role_permissions_v2 FOR ALL TO authenticated
  USING (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_role_perms_v2_lookup ON public.role_permissions_v2(company_id, role);

-- ============ 3. MEMBER PERMISSION OVERRIDES (ABAC seed) ============
CREATE TABLE IF NOT EXISTS public.member_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  granted BOOLEAN NOT NULL,
  scope JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id, permission_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_permission_overrides TO authenticated;
GRANT ALL ON public.member_permission_overrides TO service_role;
ALTER TABLE public.member_permission_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "overrides members read"
  ON public.member_permission_overrides FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "overrides admins write"
  ON public.member_permission_overrides FOR ALL TO authenticated
  USING (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'));

-- ============ 4. PERMISSION CHECK FUNCTION ============
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission_key TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ctx AS (
    SELECT company_id FROM public.profiles WHERE id = _user_id LIMIT 1
  ),
  user_role AS (
    SELECT ur.role FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.company_id = (SELECT company_id FROM ctx)
    LIMIT 1
  ),
  override AS (
    SELECT granted FROM public.member_permission_overrides o
    WHERE o.user_id = _user_id
      AND o.company_id = (SELECT company_id FROM ctx)
      AND o.permission_key = _permission_key
    LIMIT 1
  ),
  role_grant AS (
    SELECT granted FROM public.role_permissions_v2 rp
    WHERE rp.company_id = (SELECT company_id FROM ctx)
      AND rp.role = (SELECT role FROM user_role)
      AND rp.permission_key = _permission_key
    LIMIT 1
  )
  SELECT COALESCE(
    (SELECT granted FROM override),
    (SELECT granted FROM role_grant),
    -- Admin default fallback: admin gets everything if no explicit rule
    CASE WHEN (SELECT role FROM user_role) = 'admin' THEN true ELSE false END
  );
$$;

-- ============ 5. GET MY EFFECTIVE PERMISSIONS ============
CREATE OR REPLACE FUNCTION public.my_effective_permissions()
RETURNS TABLE (permission_key TEXT, source TEXT, granted BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT id AS user_id, company_id FROM public.profiles WHERE id = auth.uid()
  ),
  my_role AS (
    SELECT ur.role FROM public.user_roles ur, me
    WHERE ur.user_id = me.user_id AND ur.company_id = me.company_id LIMIT 1
  )
  SELECT p.key AS permission_key,
    CASE WHEN o.id IS NOT NULL THEN 'override'
         WHEN rp.id IS NOT NULL THEN 'role'
         WHEN (SELECT role FROM my_role) = 'admin' THEN 'admin_default'
         ELSE 'none' END AS source,
    COALESCE(o.granted, rp.granted, (SELECT role FROM my_role) = 'admin', false) AS granted
  FROM public.permissions p
  LEFT JOIN public.member_permission_overrides o
    ON o.permission_key = p.key AND o.user_id = (SELECT user_id FROM me) AND o.company_id = (SELECT company_id FROM me)
  LEFT JOIN public.role_permissions_v2 rp
    ON rp.permission_key = p.key AND rp.role = (SELECT role FROM my_role) AND rp.company_id = (SELECT company_id FROM me);
$$;

-- ============ 6. FEATURE FLAGS ENRICHMENT ============
ALTER TABLE public.feature_flags
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS module TEXT,
  ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS strategy TEXT NOT NULL DEFAULT 'boolean',
  ADD COLUMN IF NOT EXISTS rollout_percentage INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS target_roles TEXT[],
  ADD COLUMN IF NOT EXISTS target_users UUID[],
  ADD COLUMN IF NOT EXISTS depends_on TEXT[],
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by UUID;

CREATE INDEX IF NOT EXISTS idx_feature_flags_lookup ON public.feature_flags(company_id, key);

-- ============ 7. ENTITY HISTORY: VERSION + REASON ============
ALTER TABLE public.team_entity_history
  ADD COLUMN IF NOT EXISTS version INTEGER,
  ADD COLUMN IF NOT EXISTS revision_hash TEXT,
  ADD COLUMN IF NOT EXISTS change_reason TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id UUID;

CREATE INDEX IF NOT EXISTS idx_entity_history_entity
  ON public.team_entity_history(company_id, entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_history_correlation
  ON public.team_entity_history(correlation_id) WHERE correlation_id IS NOT NULL;

-- ============ 8. AUDIT LOG: CORRELATION IDS ============
ALTER TABLE public.team_audit_log
  ADD COLUMN IF NOT EXISTS correlation_id UUID,
  ADD COLUMN IF NOT EXISTS request_id UUID,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_correlation
  ON public.team_audit_log(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_company_created
  ON public.team_audit_log(company_id, created_at DESC);

-- ============ 9. DOMAIN EVENTS BUS ============
CREATE TABLE IF NOT EXISTS public.domain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id UUID,
  correlation_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.domain_events TO authenticated;
GRANT ALL ON public.domain_events TO service_role;
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events members read"
  ON public.domain_events FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "events auth insert own company"
  ON public.domain_events FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id));

CREATE INDEX IF NOT EXISTS idx_events_type ON public.domain_events(company_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_aggregate ON public.domain_events(aggregate_type, aggregate_id, occurred_at DESC);

-- ============ 10. MEMBER CHANNELS / AGENTS / TAGS ============
CREATE TABLE IF NOT EXISTS public.member_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_channels TO authenticated;
GRANT ALL ON public.member_channels TO service_role;
ALTER TABLE public.member_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc members read" ON public.member_channels FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "mc admins write" ON public.member_channels FOR ALL TO authenticated
  USING (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.member_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, agent_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_agents TO authenticated;
GRANT ALL ON public.member_agents TO service_role;
ALTER TABLE public.member_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ma members read" ON public.member_agents FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "ma admins write" ON public.member_agents FOR ALL TO authenticated
  USING (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.member_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tag)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_tags TO authenticated;
GRANT ALL ON public.member_tags TO service_role;
ALTER TABLE public.member_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt members read" ON public.member_tags FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "mt admins write" ON public.member_tags FOR ALL TO authenticated
  USING (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'));

-- ============ 11. REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.feature_flags;
ALTER PUBLICATION supabase_realtime ADD TABLE public.role_permissions_v2;
ALTER PUBLICATION supabase_realtime ADD TABLE public.member_permission_overrides;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_entity_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_audit_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.domain_events;
