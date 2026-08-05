
-- =========================================================
-- Missão Inbox-Delete-01 — Fase 1
-- Schema, RLS, RBAC e Auditoria para exclusão de mensagens
-- =========================================================

-- 1) ENUM para níveis de exclusão
DO $$ BEGIN
  CREATE TYPE public.message_deletion_scope AS ENUM ('inbox_only', 'for_me', 'for_everyone');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Soft-delete columns em public.messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS deleted_at        timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_scope     public.message_deletion_scope,
  ADD COLUMN IF NOT EXISTS deleted_reason    text,
  ADD COLUMN IF NOT EXISTS provider_delete_ack  boolean,
  ADD COLUMN IF NOT EXISTS provider_delete_error text;

CREATE INDEX IF NOT EXISTS idx_messages_deleted
  ON public.messages (conversation_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- 3) Tabela de histórico de exclusões
CREATE TABLE IF NOT EXISTS public.message_deletions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  message_id      uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  actor_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scope           public.message_deletion_scope NOT NULL,
  reason          text,
  provider_ack    boolean,
  provider_error  text,
  provider_response jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_deletions TO authenticated;
GRANT ALL ON public.message_deletions TO service_role;

CREATE INDEX IF NOT EXISTS idx_message_deletions_company_created
  ON public.message_deletions (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_deletions_message
  ON public.message_deletions (message_id);
CREATE INDEX IF NOT EXISTS idx_message_deletions_conversation
  ON public.message_deletions (conversation_id, created_at DESC);

ALTER TABLE public.message_deletions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read message deletions" ON public.message_deletions;
CREATE POLICY "Members read message deletions"
  ON public.message_deletions
  FOR SELECT
  TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "Members insert message deletions" ON public.message_deletions;
CREATE POLICY "Members insert message deletions"
  ON public.message_deletions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_company_member(company_id)
    AND actor_id = auth.uid()
  );

-- Histórico é imutável para membros comuns — updates/deletes somente via service_role.
DROP POLICY IF EXISTS "Service role manages deletions" ON public.message_deletions;
CREATE POLICY "Service role manages deletions"
  ON public.message_deletions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4) RBAC — novas permissões granulares
INSERT INTO public.permissions (key, module, action, label, description) VALUES
  ('inbox.delete.inbox_only',   'inbox', 'delete', 'Remover apenas do CRM',
   'Oculta a mensagem do Inbox da Zenda sem tocar no WhatsApp do cliente.'),
  ('inbox.delete.for_me',       'inbox', 'delete', 'Apagar para mim',
   'Remove a mensagem do WhatsApp local da empresa mantendo no cliente.'),
  ('inbox.delete.for_everyone', 'inbox', 'delete', 'Apagar para todos',
   'Envia o comando de exclusão para o cliente (revoke) via provedor.')
ON CONFLICT (key) DO NOTHING;

-- 5) Auditoria automática — trigger em messages ao marcar deleted_at
CREATE OR REPLACE FUNCTION public.audit_message_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL
     AND (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at) THEN
    INSERT INTO public.team_audit_log (
      company_id, actor_id, action, entity, entity_id, diff
    ) VALUES (
      NEW.company_id,
      NEW.deleted_by,
      'message.deleted',
      'message',
      NEW.id,
      jsonb_build_object(
        'scope', NEW.deleted_scope,
        'reason', NEW.deleted_reason,
        'conversation_id', NEW.conversation_id,
        'provider_message_id', NEW.provider_message_id,
        'provider_ack', NEW.provider_delete_ack,
        'provider_error', NEW.provider_delete_error
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_message_deletion ON public.messages;
CREATE TRIGGER trg_audit_message_deletion
  AFTER UPDATE OF deleted_at ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_message_deletion();
