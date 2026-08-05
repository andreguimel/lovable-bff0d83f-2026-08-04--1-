
CREATE TABLE public.funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#3B82F6',
  is_default boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_funnels_company_name_ci
  ON public.funnels (company_id, lower(name)) WHERE archived_at IS NULL;
CREATE INDEX idx_funnels_company ON public.funnels(company_id) WHERE archived_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funnels TO authenticated;
GRANT ALL ON public.funnels TO service_role;
ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "funnels_company_members" ON public.funnels FOR ALL
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));
CREATE TRIGGER trg_funnels_updated_at BEFORE UPDATE ON public.funnels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.funnel_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#94a3b8',
  position integer NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'open',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT funnel_stages_kind_valid CHECK (kind IN ('open','won','lost'))
);
CREATE INDEX idx_funnel_stages_funnel ON public.funnel_stages(funnel_id, position) WHERE archived_at IS NULL;
CREATE INDEX idx_funnel_stages_company ON public.funnel_stages(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funnel_stages TO authenticated;
GRANT ALL ON public.funnel_stages TO service_role;
ALTER TABLE public.funnel_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "funnel_stages_company_members" ON public.funnel_stages FOR ALL
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));
CREATE TRIGGER trg_funnel_stages_updated_at BEFORE UPDATE ON public.funnel_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.funnel_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  funnel_id uuid NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.funnel_stages(id) ON DELETE RESTRICT,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text,
  value_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'open',
  lost_reason text,
  position integer NOT NULL DEFAULT 0,
  won_at timestamptz,
  lost_at timestamptz,
  archived_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT funnel_cards_status_valid CHECK (status IN ('open','won','lost','archived'))
);
CREATE INDEX idx_funnel_cards_funnel_stage ON public.funnel_cards(funnel_id, stage_id, position) WHERE archived_at IS NULL;
CREATE INDEX idx_funnel_cards_contact ON public.funnel_cards(contact_id) WHERE archived_at IS NULL;
CREATE INDEX idx_funnel_cards_company ON public.funnel_cards(company_id) WHERE archived_at IS NULL;
CREATE INDEX idx_funnel_cards_assigned ON public.funnel_cards(assigned_user_id) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX ux_funnel_cards_active_contact_funnel
  ON public.funnel_cards(funnel_id, contact_id)
  WHERE status = 'open' AND archived_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funnel_cards TO authenticated;
GRANT ALL ON public.funnel_cards TO service_role;
ALTER TABLE public.funnel_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "funnel_cards_company_members" ON public.funnel_cards FOR ALL
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));
CREATE TRIGGER trg_funnel_cards_updated_at BEFORE UPDATE ON public.funnel_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.funnel_card_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.funnel_cards(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_stage_id uuid REFERENCES public.funnel_stages(id) ON DELETE SET NULL,
  to_stage_id uuid REFERENCES public.funnel_stages(id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_funnel_card_events_card ON public.funnel_card_events(card_id, created_at DESC);
CREATE INDEX idx_funnel_card_events_company ON public.funnel_card_events(company_id);
GRANT SELECT, INSERT ON public.funnel_card_events TO authenticated;
GRANT ALL ON public.funnel_card_events TO service_role;
ALTER TABLE public.funnel_card_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "funnel_card_events_read" ON public.funnel_card_events FOR SELECT
  USING (public.is_company_member(company_id));
CREATE POLICY "funnel_card_events_insert" ON public.funnel_card_events FOR INSERT
  WITH CHECK (public.is_company_member(company_id));

INSERT INTO public.permissions (key, module, action, label, description) VALUES
  ('funnels.view',        'funnels', 'view',   'Visualizar funis',       'Ver funis, etapas e cards.'),
  ('funnels.manage',      'funnels', 'manage', 'Gerenciar funis',        'Criar/editar/arquivar funis e etapas.'),
  ('funnels.card.create', 'funnels', 'create', 'Criar oportunidade',     'Adicionar cards ao funil.'),
  ('funnels.card.edit',   'funnels', 'edit',   'Editar oportunidade',    'Editar valor, título, responsável.'),
  ('funnels.card.move',   'funnels', 'move',   'Mover cards',            'Mover cards entre etapas.'),
  ('funnels.card.delete', 'funnels', 'delete', 'Arquivar/excluir cards', 'Arquivar ou excluir cards.')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  co record;
  new_funnel_id uuid;
  s_lead uuid; s_qual uuid; s_prop uuid; s_neg uuid; s_won uuid; s_lost uuid;
BEGIN
  FOR co IN SELECT id FROM public.companies LOOP
    IF EXISTS (SELECT 1 FROM public.funnels WHERE company_id = co.id) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.funnels (company_id, name, description, is_default)
    VALUES (co.id, 'Comercial', 'Funil comercial padrão', true)
    RETURNING id INTO new_funnel_id;

    INSERT INTO public.funnel_stages (funnel_id, company_id, name, color, position, kind) VALUES
      (new_funnel_id, co.id, 'Lead',        '#94a3b8', 0, 'open'),
      (new_funnel_id, co.id, 'Qualificado', '#38bdf8', 1, 'open'),
      (new_funnel_id, co.id, 'Proposta',    '#f59e0b', 2, 'open'),
      (new_funnel_id, co.id, 'Negociação',  '#8b5cf6', 3, 'open'),
      (new_funnel_id, co.id, 'Ganhos',      '#22c55e', 4, 'won'),
      (new_funnel_id, co.id, 'Perdidos',    '#ef4444', 5, 'lost');

    SELECT id INTO s_lead FROM public.funnel_stages WHERE funnel_id=new_funnel_id AND name='Lead';
    SELECT id INTO s_qual FROM public.funnel_stages WHERE funnel_id=new_funnel_id AND name='Qualificado';
    SELECT id INTO s_prop FROM public.funnel_stages WHERE funnel_id=new_funnel_id AND name='Proposta';
    SELECT id INTO s_neg  FROM public.funnel_stages WHERE funnel_id=new_funnel_id AND name='Negociação';
    SELECT id INTO s_won  FROM public.funnel_stages WHERE funnel_id=new_funnel_id AND name='Ganhos';
    SELECT id INTO s_lost FROM public.funnel_stages WHERE funnel_id=new_funnel_id AND name='Perdidos';

    INSERT INTO public.funnel_cards (company_id, funnel_id, stage_id, contact_id, assigned_user_id, value_cents, status)
    SELECT co.id, new_funnel_id,
      CASE COALESCE(c.funnel_stage, 'lead')
        WHEN 'lead' THEN s_lead
        WHEN 'qualified' THEN s_qual
        WHEN 'proposal' THEN s_prop
        WHEN 'negotiation' THEN s_neg
        WHEN 'won' THEN s_won
        WHEN 'lost' THEN s_lost
        ELSE s_lead
      END,
      c.id, c.owner_id, COALESCE(c.deal_value_cents, 0),
      CASE COALESCE(c.funnel_stage, 'lead')
        WHEN 'won' THEN 'won'
        WHEN 'lost' THEN 'lost'
        ELSE 'open'
      END
    FROM public.contacts c
    WHERE c.company_id = co.id AND c.deleted_at IS NULL
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
