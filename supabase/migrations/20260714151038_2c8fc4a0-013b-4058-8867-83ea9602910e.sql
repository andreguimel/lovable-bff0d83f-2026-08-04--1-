
-- Add workspace preferences columns
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'pt-BR';

-- Notification preferences per user
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Pending invites table
CREATE TABLE IF NOT EXISTS public.pending_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'agent',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, company_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_invites TO authenticated;
GRANT ALL ON public.pending_invites TO service_role;

ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view invites of their company"
  ON public.pending_invites FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY "Admins can insert invites"
  ON public.pending_invites FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete invites"
  ON public.pending_invites FOR DELETE TO authenticated
  USING (public.is_company_member(company_id) AND public.has_role(auth.uid(), 'admin'));

-- New user handler: consume pending invite before falling back to new company
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite record;
  new_company_id uuid;
  company_name text;
BEGIN
  -- Try to consume a pending invite by email
  SELECT * INTO invite FROM public.pending_invites WHERE email = NEW.email LIMIT 1;

  IF invite.id IS NOT NULL THEN
    INSERT INTO public.profiles (id, company_id, full_name, email, avatar_url)
    VALUES (
      NEW.id,
      invite.company_id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      NEW.email,
      NEW.raw_user_meta_data->>'avatar_url'
    );
    INSERT INTO public.user_roles (user_id, company_id, role)
    VALUES (NEW.id, invite.company_id, invite.role);
    DELETE FROM public.pending_invites WHERE id = invite.id;
    RETURN NEW;
  END IF;

  -- Fallback: create a new company for solo signup
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

  INSERT INTO public.tags (company_id, name, color) VALUES
    (new_company_id, 'Lead', '#3B82F6'),
    (new_company_id, 'Cliente', '#22C55E'),
    (new_company_id, 'VIP', '#F59E0B');

  INSERT INTO public.quick_replies (company_id, shortcut, title, body) VALUES
    (new_company_id, '/ola', 'Boas-vindas', 'Olá {{nome}}! Como posso te ajudar hoje?'),
    (new_company_id, '/obrigado', 'Agradecimento', 'Muito obrigado pelo contato! 🙌'),
    (new_company_id, '/preco', 'Enviar preço', 'Nosso plano começa em R$ 197/mês. Posso te enviar mais detalhes?');

  RETURN NEW;
END;
$$;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trg_pending_invites_updated_at ON public.pending_invites;
