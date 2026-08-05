-- Extend handle_new_user with demo seed data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_company_id uuid;
  company_name text;
  demo_channel_id uuid;
  contact_id_1 uuid;
  contact_id_2 uuid;
  contact_id_3 uuid;
  conv_id_1 uuid;
  conv_id_2 uuid;
  conv_id_3 uuid;
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

  -- Seed channel
  INSERT INTO public.channels (company_id, name, phone_number, status)
  VALUES (new_company_id, 'Comercial', '+55 11 90000-0000', 'disconnected')
  RETURNING id INTO demo_channel_id;

  INSERT INTO public.tags (company_id, name, color) VALUES
    (new_company_id, 'Lead', '#3B82F6'),
    (new_company_id, 'Cliente', '#22C55E'),
    (new_company_id, 'VIP', '#F59E0B');

  INSERT INTO public.quick_replies (company_id, shortcut, title, body) VALUES
    (new_company_id, '/ola', 'Boas-vindas', 'Olá {{nome}}! Como posso te ajudar hoje?'),
    (new_company_id, '/obrigado', 'Agradecimento', 'Muito obrigado pelo contato! 🙌'),
    (new_company_id, '/preco', 'Enviar preço', 'Nosso plano começa em R$ 197/mês. Posso te enviar mais detalhes?');

  -- Demo contacts
  INSERT INTO public.contacts (company_id, name, phone, email, last_interaction_at)
  VALUES (new_company_id, 'Ana Souza', '+55 11 98765-4321', 'ana@example.com', now())
  RETURNING id INTO contact_id_1;

  INSERT INTO public.contacts (company_id, name, phone, email, last_interaction_at)
  VALUES (new_company_id, 'Carlos Mendes', '+55 21 91234-5678', 'carlos@example.com', now() - interval '2 hours')
  RETURNING id INTO contact_id_2;

  INSERT INTO public.contacts (company_id, name, phone, last_interaction_at)
  VALUES (new_company_id, 'Beatriz Lima', '+55 31 99887-6655', now() - interval '1 day')
  RETURNING id INTO contact_id_3;

  -- Demo conversations
  INSERT INTO public.conversations (company_id, contact_id, channel_id, status, last_message_at, last_message_preview, unread_count)
  VALUES (new_company_id, contact_id_1, demo_channel_id, 'open', now(), 'Oi! Tudo bem? Vi seu produto e...', 2)
  RETURNING id INTO conv_id_1;

  INSERT INTO public.conversations (company_id, contact_id, channel_id, status, last_message_at, last_message_preview, unread_count)
  VALUES (new_company_id, contact_id_2, demo_channel_id, 'pending', now() - interval '2 hours', 'Perfeito, aguardo o retorno.', 0)
  RETURNING id INTO conv_id_2;

  INSERT INTO public.conversations (company_id, contact_id, channel_id, status, last_message_at, last_message_preview, unread_count)
  VALUES (new_company_id, contact_id_3, demo_channel_id, 'resolved', now() - interval '1 day', 'Obrigada pela ajuda!', 0)
  RETURNING id INTO conv_id_3;

  -- Demo messages
  INSERT INTO public.messages (company_id, conversation_id, direction, type, body, created_at) VALUES
    (new_company_id, conv_id_1, 'inbound', 'text', 'Oi! Tudo bem?', now() - interval '10 minutes'),
    (new_company_id, conv_id_1, 'inbound', 'text', 'Vi seu produto e queria saber mais sobre os planos.', now() - interval '9 minutes'),
    (new_company_id, conv_id_2, 'inbound', 'text', 'Bom dia, preciso de um orçamento.', now() - interval '3 hours'),
    (new_company_id, conv_id_2, 'outbound', 'text', 'Claro! Vou preparar e envio ainda hoje.', now() - interval '2 hours 30 minutes'),
    (new_company_id, conv_id_2, 'inbound', 'text', 'Perfeito, aguardo o retorno.', now() - interval '2 hours'),
    (new_company_id, conv_id_3, 'inbound', 'text', 'Consegui resolver, obrigada pela ajuda!', now() - interval '1 day');

  RETURN NEW;
END;
$$;