
-- =========================================================================
-- ENUMS
-- =========================================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'agent');
CREATE TYPE public.conversation_status AS ENUM ('open', 'pending', 'resolved');
CREATE TYPE public.message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE public.message_type AS ENUM ('text', 'image', 'audio', 'file', 'video', 'system');
CREATE TYPE public.channel_status AS ENUM ('disconnected', 'connecting', 'connected');
CREATE TYPE public.flow_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE public.flow_trigger_type AS ENUM ('keyword', 'new_contact', 'button_click', 'webhook', 'manual', 'default');
CREATE TYPE public.custom_field_type AS ENUM ('text', 'number', 'date', 'email', 'select');
CREATE TYPE public.broadcast_status AS ENUM ('draft', 'scheduled', 'sending', 'completed', 'failed');
CREATE TYPE public.assigned_type AS ENUM ('unassigned', 'agent_user', 'ai_agent');

-- =========================================================================
-- COMPANIES
-- =========================================================================
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- PROFILES (linked to auth.users)
-- =========================================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  full_name text,
  email text,
  avatar_url text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- USER ROLES
-- =========================================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- SECURITY DEFINER helpers (no recursion in RLS)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND company_id = _company_id
  )
$$;

-- =========================================================================
-- Timestamp trigger
-- =========================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================================
-- Policies for companies / profiles / user_roles
-- =========================================================================
CREATE POLICY "Members can view their company" ON public.companies
  FOR SELECT TO authenticated USING (public.is_company_member(id));
CREATE POLICY "Admins can update their company" ON public.companies
  FOR UPDATE TO authenticated USING (public.is_company_member(id) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users see profiles in their company" ON public.profiles
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE POLICY "Users view roles in their company" ON public.user_roles
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());

CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- CHANNELS (WhatsApp numbers - mocked)
-- =========================================================================
CREATE TABLE public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone_number text,
  avatar_url text,
  color text DEFAULT '#25D366',
  status public.channel_status NOT NULL DEFAULT 'disconnected',
  provider text DEFAULT 'mock',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members see own channels" ON public.channels
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());
CREATE POLICY "Admins manage channels" ON public.channels
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_channels_updated BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- TAGS
-- =========================================================================
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3B82F6',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage tags" ON public.tags
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

-- =========================================================================
-- CONTACTS
-- =========================================================================
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  avatar_url text,
  notes text,
  last_interaction_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_contacts_company ON public.contacts(company_id);
CREATE POLICY "Members manage contacts" ON public.contacts
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- CONTACT_TAGS (m2m)
-- =========================================================================
CREATE TABLE public.contact_tags (
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_tags TO authenticated;
GRANT ALL ON public.contact_tags TO service_role;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage contact_tags" ON public.contact_tags
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

-- =========================================================================
-- CUSTOM_FIELDS
-- =========================================================================
CREATE TABLE public.custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  field_type public.custom_field_type NOT NULL DEFAULT 'text',
  options jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_fields TO authenticated;
GRANT ALL ON public.custom_fields TO service_role;
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage custom_fields" ON public.custom_fields
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

-- =========================================================================
-- CONTACT_FIELD_VALUES
-- =========================================================================
CREATE TABLE public.contact_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, field_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_field_values TO authenticated;
GRANT ALL ON public.contact_field_values TO service_role;
ALTER TABLE public.contact_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage contact_field_values" ON public.contact_field_values
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
CREATE TRIGGER trg_cfv_updated BEFORE UPDATE ON public.contact_field_values FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- AI_AGENTS
-- =========================================================================
CREATE TABLE public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  avatar_url text,
  model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  temperature numeric(3,2) NOT NULL DEFAULT 0.7,
  prompt text NOT NULL DEFAULT '',
  personality text,
  transfer_rules jsonb DEFAULT '{}'::jsonb,
  knowledge_files jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agents TO authenticated;
GRANT ALL ON public.ai_agents TO service_role;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage ai_agents" ON public.ai_agents
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
CREATE TRIGGER trg_ai_agents_updated BEFORE UPDATE ON public.ai_agents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- CONVERSATIONS
-- =========================================================================
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  status public.conversation_status NOT NULL DEFAULT 'open',
  assigned_type public.assigned_type NOT NULL DEFAULT 'unassigned',
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count int NOT NULL DEFAULT 0,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_conversations_company ON public.conversations(company_id, last_message_at DESC);
CREATE POLICY "Members manage conversations" ON public.conversations
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
CREATE TRIGGER trg_conversations_updated BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- MESSAGES
-- =========================================================================
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction public.message_direction NOT NULL,
  type public.message_type NOT NULL DEFAULT 'text',
  body text,
  media_url text,
  media_metadata jsonb,
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  status text DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_messages_conv ON public.messages(conversation_id, created_at);
CREATE POLICY "Members manage messages" ON public.messages
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

-- =========================================================================
-- FLOWS + NODES + EDGES
-- =========================================================================
CREATE TABLE public.flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status public.flow_status NOT NULL DEFAULT 'draft',
  trigger_type public.flow_trigger_type NOT NULL DEFAULT 'manual',
  trigger_config jsonb DEFAULT '{}'::jsonb,
  runs_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flows TO authenticated;
GRANT ALL ON public.flows TO service_role;
ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage flows" ON public.flows
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
CREATE TRIGGER trg_flows_updated BEFORE UPDATE ON public.flows FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.flow_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  node_type text NOT NULL,
  position jsonb NOT NULL DEFAULT '{"x":0,"y":0}'::jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_nodes TO authenticated;
GRANT ALL ON public.flow_nodes TO service_role;
ALTER TABLE public.flow_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage flow_nodes" ON public.flow_nodes
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

CREATE TABLE public.flow_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES public.flow_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.flow_nodes(id) ON DELETE CASCADE,
  source_handle text,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_edges TO authenticated;
GRANT ALL ON public.flow_edges TO service_role;
ALTER TABLE public.flow_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage flow_edges" ON public.flow_edges
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

-- =========================================================================
-- QUICK_REPLIES
-- =========================================================================
CREATE TABLE public.quick_reply_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_reply_folders TO authenticated;
GRANT ALL ON public.quick_reply_folders TO service_role;
ALTER TABLE public.quick_reply_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage qr_folders" ON public.quick_reply_folders
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

CREATE TABLE public.quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES public.quick_reply_folders(id) ON DELETE SET NULL,
  shortcut text NOT NULL,
  title text NOT NULL,
  body text,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, shortcut)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_replies TO authenticated;
GRANT ALL ON public.quick_replies TO service_role;
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage quick_replies" ON public.quick_replies
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
CREATE TRIGGER trg_qr_updated BEFORE UPDATE ON public.quick_replies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- BROADCASTS
-- =========================================================================
CREATE TABLE public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  flow_id uuid REFERENCES public.flows(id) ON DELETE SET NULL,
  message_body text,
  segment jsonb DEFAULT '{}'::jsonb,
  scheduled_at timestamptz,
  status public.broadcast_status NOT NULL DEFAULT 'draft',
  stats jsonb DEFAULT '{"sent":0,"read":0,"replied":0}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage broadcasts" ON public.broadcasts
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
CREATE TRIGGER trg_broadcasts_updated BEFORE UPDATE ON public.broadcasts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_recipients TO authenticated;
GRANT ALL ON public.broadcast_recipients TO service_role;
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage broadcast_recipients" ON public.broadcast_recipients
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

-- =========================================================================
-- ONBOARDING TRIGGER: handle_new_user
-- Creates a company + profile + admin role on first signup
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_company_id uuid;
  company_name text;
BEGIN
  company_name := COALESCE(NEW.raw_user_meta_data->>'company_name', 'Minha Empresa');

  INSERT INTO public.companies (name)
  VALUES (company_name)
  RETURNING id INTO new_company_id;

  INSERT INTO public.profiles (id, company_id, full_name, email, avatar_url)
  VALUES (
    NEW.id,
    new_company_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (NEW.id, new_company_id, 'admin');

  -- Seed: one demo channel + a few tags
  INSERT INTO public.channels (company_id, name, phone_number, status)
  VALUES (new_company_id, 'Comercial', '+55 11 90000-0000', 'disconnected');

  INSERT INTO public.tags (company_id, name, color) VALUES
    (new_company_id, 'Lead', '#3B82F6'),
    (new_company_id, 'Cliente', '#22C55E'),
    (new_company_id, 'VIP', '#F59E0B');

  INSERT INTO public.quick_replies (company_id, shortcut, title, body) VALUES
    (new_company_id, '/ola', 'Boas-vindas', 'Olá {{nome}}! Como posso te ajudar hoje?'),
    (new_company_id, '/obrigado', 'Agradecimento', 'Muito obrigado pelo contato! 🙌');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- Realtime for messages + conversations
-- =========================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
