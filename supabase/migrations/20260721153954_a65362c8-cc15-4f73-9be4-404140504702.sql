
-- ONDA 1 — retry com seed de permissões corrigido

-- 1) CONTACTS ---------------------------------------------------------------
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phone_canonical         text,
  ADD COLUMN IF NOT EXISTS last_inbound_channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_into_id          uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

WITH digits AS (
  SELECT id, regexp_replace(coalesce(phone, ''), '\D', '', 'g') AS d
  FROM public.contacts
  WHERE phone IS NOT NULL AND deleted_at IS NULL
)
UPDATE public.contacts c
SET phone_canonical = CASE
  WHEN d.d ~ '^55[1-9][0-9]{9,10}$' THEN '+' || d.d
  WHEN d.d ~ '^[1-9][0-9]{9,10}$'   THEN '+55' || d.d
  WHEN length(d.d) BETWEEN 8 AND 15 AND left(d.d, 1) <> '0' THEN '+' || d.d
  ELSE NULL
END
FROM digits d
WHERE c.id = d.id AND c.phone_canonical IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_company_phone_canonical_active
  ON public.contacts (company_id, phone_canonical)
  WHERE deleted_at IS NULL AND merged_into_id IS NULL AND phone_canonical IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_last_inbound_channel
  ON public.contacts (last_inbound_channel_id) WHERE last_inbound_channel_id IS NOT NULL;

-- 2) CONVERSATIONS ----------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL;

ALTER TABLE public.conversations ALTER COLUMN channel_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_company_contact_active
  ON public.conversations (company_id, contact_id)
  WHERE status IN ('open','pending') AND merged_into_id IS NULL;

-- 3) MESSAGES ---------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS channel_id      uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cascade_run_id  uuid REFERENCES public.cascade_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS flow_run_id     uuid REFERENCES public.flow_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS broadcast_id    uuid REFERENCES public.broadcasts(id) ON DELETE SET NULL;

UPDATE public.messages m
SET channel_id = c.channel_id
FROM public.conversations c
WHERE m.conversation_id = c.id AND m.channel_id IS NULL AND c.channel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON public.messages (channel_id, created_at DESC) WHERE channel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_cascade_run     ON public.messages (cascade_run_id) WHERE cascade_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_flow_run        ON public.messages (flow_run_id)    WHERE flow_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_broadcast       ON public.messages (broadcast_id)   WHERE broadcast_id IS NOT NULL;

WITH last_in AS (
  SELECT DISTINCT ON (co.contact_id) co.contact_id, m.channel_id
  FROM public.messages m
  JOIN public.conversations co ON co.id = m.conversation_id
  WHERE m.direction = 'inbound' AND m.channel_id IS NOT NULL
  ORDER BY co.contact_id, m.created_at DESC
)
UPDATE public.contacts c
SET last_inbound_channel_id = li.channel_id
FROM last_in li
WHERE c.id = li.contact_id AND c.last_inbound_channel_id IS NULL;

-- 4) CASCADE RUNS -----------------------------------------------------------
ALTER TABLE public.cascade_runs
  ADD COLUMN IF NOT EXISTS lock_token          uuid,
  ADD COLUMN IF NOT EXISTS lock_expires_at     timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key     text,
  ADD COLUMN IF NOT EXISTS channel_id          uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stopped_by_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS reply_message_id    uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_channel_id    uuid REFERENCES public.channels(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cascade_runs_company_idempotency
  ON public.cascade_runs (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cascade_runs_contact_status
  ON public.cascade_runs (company_id, contact_id, status) WHERE status = 'running';

-- 5) CASCADE ATTEMPTS -------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_cascade_attempts_run_step_uniq
  ON public.cascade_attempts (run_id, step_index);

-- 6) FUNCTIONS --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cascade_run_claim(_ttl_seconds integer DEFAULT 60)
RETURNS TABLE (id uuid, lock_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_token uuid := gen_random_uuid();
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT r.id FROM public.cascade_runs r
    WHERE r.status = 'running' AND r.run_at <= now()
      AND (r.lock_token IS NULL OR r.lock_expires_at IS NULL OR r.lock_expires_at < now())
    ORDER BY r.run_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  UPDATE public.cascade_runs r
     SET lock_token = new_token,
         lock_expires_at = now() + make_interval(secs => _ttl_seconds)
   FROM candidate WHERE r.id = candidate.id
  RETURNING r.id, new_token;
END; $$;

CREATE OR REPLACE FUNCTION public.cascade_run_release(_run_id uuid, _lock_token uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.cascade_runs SET lock_token = NULL, lock_expires_at = NULL
   WHERE id = _run_id AND lock_token = _lock_token RETURNING true;
$$;

CREATE OR REPLACE FUNCTION public.cascade_stop_on_reply(
  _company_id uuid, _contact_id uuid, _reply_message_id uuid, _reply_channel_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE stopped integer;
BEGIN
  WITH updated AS (
    UPDATE public.cascade_runs r
       SET status='stopped_by_reply', stopped_by_reply_at=now(),
           reply_message_id=_reply_message_id, reply_channel_id=_reply_channel_id,
           completed_at=now(), lock_token=NULL, lock_expires_at=NULL
     WHERE r.company_id=_company_id AND r.contact_id=_contact_id AND r.status='running'
    RETURNING r.id
  )
  SELECT count(*) INTO stopped FROM updated;
  RETURN stopped;
END; $$;

REVOKE ALL ON FUNCTION public.cascade_run_claim(integer) FROM public;
REVOKE ALL ON FUNCTION public.cascade_run_release(uuid,uuid) FROM public;
REVOKE ALL ON FUNCTION public.cascade_stop_on_reply(uuid,uuid,uuid,uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.cascade_run_claim(integer)     TO service_role;
GRANT EXECUTE ON FUNCTION public.cascade_run_release(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cascade_stop_on_reply(uuid,uuid,uuid,uuid) TO service_role;

-- 7) RBAC seeds -------------------------------------------------------------
INSERT INTO public.permissions (key, module, action, label, description) VALUES
  ('cascade.view',   'cascade', 'view',   'Visualizar cascatas', 'Ver políticas e execuções de cascata'),
  ('cascade.manage', 'cascade', 'manage', 'Gerenciar cascatas',  'Criar, iniciar e cancelar cascatas de reengajamento')
ON CONFLICT (key) DO NOTHING;
