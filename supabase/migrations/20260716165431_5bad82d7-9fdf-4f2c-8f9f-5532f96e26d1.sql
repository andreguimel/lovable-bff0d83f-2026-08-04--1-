
-- =========================================================================
-- ENRICHMENT-01 · Fase 1 · Schema + RBAC + RLS
-- =========================================================================

-- 1) ENUMS ---------------------------------------------------------------

CREATE TYPE public.enrichment_source_type AS ENUM (
  'text_message',
  'audio_transcript',
  'ocr_document',
  'ocr_image'
);

CREATE TYPE public.enrichment_run_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'skipped'
);

CREATE TYPE public.enrichment_suggestion_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'superseded',
  'expired'
);

CREATE TYPE public.enrichment_action AS ENUM (
  'auto_applied',
  'suggested',
  'ignored',
  'applied_from_suggestion',
  'rejected'
);

-- 2) contact_enrichment_runs --------------------------------------------

CREATE TABLE public.contact_enrichment_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  source_type public.enrichment_source_type NOT NULL,
  status public.enrichment_run_status NOT NULL DEFAULT 'pending',
  model text,
  latency_ms integer,
  token_usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  extracted_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_enrichment_runs_unique_message UNIQUE (message_id)
);

CREATE INDEX idx_enrichment_runs_company ON public.contact_enrichment_runs(company_id);
CREATE INDEX idx_enrichment_runs_contact ON public.contact_enrichment_runs(contact_id, created_at DESC);
CREATE INDEX idx_enrichment_runs_status  ON public.contact_enrichment_runs(company_id, status) WHERE status IN ('pending','processing','failed');

GRANT SELECT ON public.contact_enrichment_runs TO authenticated;
GRANT ALL    ON public.contact_enrichment_runs TO service_role;

ALTER TABLE public.contact_enrichment_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "enrichment_runs_select_company"
  ON public.contact_enrichment_runs FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- Writes are server-only (service_role). No INSERT/UPDATE/DELETE policies for authenticated.

-- 3) contact_enrichment_suggestions -------------------------------------

CREATE TABLE public.contact_enrichment_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.contact_enrichment_runs(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  field_key text NOT NULL,
  current_value jsonb,
  suggested_value jsonb NOT NULL,
  confidence numeric(4,3) NOT NULL,
  source_type public.enrichment_source_type NOT NULL,
  model text,
  status public.enrichment_suggestion_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_reason text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrichment_confidence_range CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX idx_enrichment_sugg_company ON public.contact_enrichment_suggestions(company_id);
CREATE INDEX idx_enrichment_sugg_contact_pending
  ON public.contact_enrichment_suggestions(contact_id)
  WHERE status = 'pending';
CREATE INDEX idx_enrichment_sugg_status_created
  ON public.contact_enrichment_suggestions(company_id, status, created_at DESC);

GRANT SELECT, UPDATE ON public.contact_enrichment_suggestions TO authenticated;
GRANT ALL            ON public.contact_enrichment_suggestions TO service_role;

ALTER TABLE public.contact_enrichment_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "enrichment_sugg_select_company"
  ON public.contact_enrichment_suggestions FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- Only reviewers can flip status. INSERT/DELETE are server-only.
CREATE POLICY "enrichment_sugg_update_reviewer"
  ON public.contact_enrichment_suggestions FOR UPDATE TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_permission(auth.uid(), 'contacts.enrichment.review')
  )
  WITH CHECK (
    public.is_company_member(company_id)
    AND public.has_permission(auth.uid(), 'contacts.enrichment.review')
  );

-- 4) contact_enrichment_history (append-only) ---------------------------

CREATE TABLE public.contact_enrichment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.contact_enrichment_runs(id) ON DELETE SET NULL,
  suggestion_id uuid REFERENCES public.contact_enrichment_suggestions(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  field_key text NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  confidence numeric(4,3),
  action public.enrichment_action NOT NULL,
  source_type public.enrichment_source_type,
  model text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_enrichment_hist_company ON public.contact_enrichment_history(company_id);
CREATE INDEX idx_enrichment_hist_contact ON public.contact_enrichment_history(contact_id, created_at DESC);

GRANT SELECT ON public.contact_enrichment_history TO authenticated;
GRANT ALL    ON public.contact_enrichment_history TO service_role;

ALTER TABLE public.contact_enrichment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "enrichment_hist_select_company"
  ON public.contact_enrichment_history FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- Writes are server-only.

-- 5) updated_at triggers ------------------------------------------------

CREATE TRIGGER trg_enrichment_runs_updated_at
  BEFORE UPDATE ON public.contact_enrichment_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_enrichment_sugg_updated_at
  BEFORE UPDATE ON public.contact_enrichment_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) Audit trigger: suggestion status transitions -----------------------

CREATE OR REPLACE FUNCTION public.audit_enrichment_suggestion_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.team_audit_log (
      company_id, actor_id, action, entity, entity_id, diff
    ) VALUES (
      NEW.company_id,
      COALESCE(NEW.reviewed_by, auth.uid()),
      'contact.enrichment.suggestion.' || NEW.status::text,
      'enrichment_suggestion',
      NEW.id,
      jsonb_build_object(
        'contact_id',      NEW.contact_id,
        'field_key',       NEW.field_key,
        'from_status',     OLD.status,
        'to_status',       NEW.status,
        'suggested_value', NEW.suggested_value,
        'current_value',   NEW.current_value,
        'confidence',      NEW.confidence,
        'review_reason',   NEW.review_reason
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_enrichment_suggestion_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_audit_enrichment_suggestion
  AFTER UPDATE OF status ON public.contact_enrichment_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.audit_enrichment_suggestion_change();

-- 7) RBAC · new permissions --------------------------------------------

INSERT INTO public.permissions (key, module, action, label, description) VALUES
  ('contacts.enrichment.auto_apply', 'contacts', 'enrichment.auto_apply',
   'Aplicar enriquecimento automático',
   'Recebe as atualizações automáticas de campo do Agente de Enriquecimento.'),
  ('contacts.enrichment.review',     'contacts', 'enrichment.review',
   'Revisar sugestões da IA',
   'Aprovar ou rejeitar sugestões de atualização de contato geradas pela IA.'),
  ('contacts.enrichment.configure',  'contacts', 'enrichment.configure',
   'Configurar Agente de Enriquecimento',
   'Ajustar limites de confiança e ativar/desativar o Agente de Enriquecimento por empresa.')
ON CONFLICT (key) DO NOTHING;
