
-- Team Management Center: departments, job titles, queues, profiles, permissions, audit, presence

-- 1) Departments
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  parent_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dept company" ON public.departments FOR ALL TO authenticated
  USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));
CREATE TRIGGER trg_dept_updated BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Job titles
CREATE TABLE IF NOT EXISTS public.job_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_titles TO authenticated;
GRANT ALL ON public.job_titles TO service_role;
ALTER TABLE public.job_titles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jt company" ON public.job_titles FOR ALL TO authenticated
  USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));

-- 3) Member profile extension
CREATE TABLE IF NOT EXISTS public.team_member_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone TEXT,
  whatsapp TEXT,
  hire_date DATE,
  supervisor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  job_title_id UUID REFERENCES public.job_titles(id) ON DELETE SET NULL,
  job_title TEXT,
  ai_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  bio TEXT,
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_member_profiles TO authenticated;
GRANT ALL ON public.team_member_profiles TO service_role;
ALTER TABLE public.team_member_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tmp company" ON public.team_member_profiles FOR ALL TO authenticated
  USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));
CREATE TRIGGER trg_tmp_updated BEFORE UPDATE ON public.team_member_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Queues
CREATE TABLE IF NOT EXISTS public.team_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 5,
  capacity INT NOT NULL DEFAULT 10,
  color TEXT DEFAULT '#22C55E',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_queues TO authenticated;
GRANT ALL ON public.team_queues TO service_role;
ALTER TABLE public.team_queues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "queues company" ON public.team_queues FOR ALL TO authenticated
  USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));

CREATE TABLE IF NOT EXISTS public.team_queue_members (
  queue_id UUID NOT NULL REFERENCES public.team_queues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight INT DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (queue_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_queue_members TO authenticated;
GRANT ALL ON public.team_queue_members TO service_role;
ALTER TABLE public.team_queue_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qm via queue" ON public.team_queue_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_queues q WHERE q.id = queue_id AND public.is_company_member(q.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_queues q WHERE q.id = queue_id AND public.is_company_member(q.company_id)));

-- 5) Permissions matrix (per company, per role, per module/action)
CREATE TABLE IF NOT EXISTS public.team_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, role, module, action)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_role_permissions TO authenticated;
GRANT ALL ON public.team_role_permissions TO service_role;
ALTER TABLE public.team_role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trp company" ON public.team_role_permissions FOR ALL TO authenticated
  USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));

-- 6) Audit log
CREATE TABLE IF NOT EXISTS public.team_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id UUID,
  diff JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.team_audit_log TO authenticated;
GRANT ALL ON public.team_audit_log TO service_role;
ALTER TABLE public.team_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit company" ON public.team_audit_log FOR ALL TO authenticated
  USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));

-- 7) Presence
CREATE TABLE IF NOT EXISTS public.team_presence (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'offline',
  current_activity TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_presence TO authenticated;
GRANT ALL ON public.team_presence TO service_role;
ALTER TABLE public.team_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "presence company" ON public.team_presence FOR ALL TO authenticated
  USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));

-- 8) Schedules (simple weekday shifts)
CREATE TABLE IF NOT EXISTS public.team_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_schedules TO authenticated;
GRANT ALL ON public.team_schedules TO service_role;
ALTER TABLE public.team_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sched company" ON public.team_schedules FOR ALL TO authenticated
  USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));
