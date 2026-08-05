# Missão Enrichment-01 — Fase 1 (Schema + RBAC + RLS)

**Data:** 2026-07-16
**Escopo:** Fundação de banco de dados para o Agente de Enriquecimento Automático de Contatos.
**Autorização:** Descongelamento parcial pontual (padrão Inbox-Delete-01). Recomendação (A) aceita: Fase 1 isolada agora, Fase 7 no backlog, OCR provider decidido depois.

---

## Entregas

### Enums
- `enrichment_source_type` — `text_message | audio_transcript | ocr_document | ocr_image`
- `enrichment_run_status` — `pending | processing | completed | failed | skipped`
- `enrichment_suggestion_status` — `pending | approved | rejected | superseded | expired`
- `enrichment_action` — `auto_applied | suggested | ignored | applied_from_suggestion | rejected`

### Tabelas

| Tabela | Propósito | Escrita | Leitura |
|---|---|---|---|
| `contact_enrichment_runs` | 1 linha por mensagem processada. Idempotência via `UNIQUE(message_id)`. Guarda payload, modelo, latência, tokens, erro. | server-only (`service_role`) | membros da empresa |
| `contact_enrichment_suggestions` | Sugestões pendentes de revisão humana (conflito de valor ou confiança 70–95%). | INSERT server-only; UPDATE só para membro com `contacts.enrichment.review` | membros da empresa |
| `contact_enrichment_history` | Log append-only de tudo (auto-aplicado, sugerido, ignorado, aprovado, rejeitado). | server-only | membros da empresa |

Todas com `company_id NOT NULL REFERENCES companies` + índices por `company_id`, `contact_id`, status parcial para pendentes.

### RLS
- **`contact_enrichment_runs`**: `SELECT` para `is_company_member(company_id)`. Sem policies de mutação → escrita exclusiva via `service_role`.
- **`contact_enrichment_suggestions`**: `SELECT` para membros; `UPDATE` restrito a `is_company_member` **AND** `has_permission(auth.uid(), 'contacts.enrichment.review')`. INSERT/DELETE apenas via `service_role`.
- **`contact_enrichment_history`**: `SELECT` para membros. Sem policies de mutação (append-only server-side).

### RBAC (novas permissões em `public.permissions`)
- `contacts.enrichment.auto_apply` — informativo, controla notificações de auto-preenchimento.
- `contacts.enrichment.review` — habilita aprovar/rejeitar sugestões (obrigatório para `UPDATE` na tabela de sugestões).
- `contacts.enrichment.configure` — habilita ajuste de thresholds e ativação por empresa.

Idempotente via `ON CONFLICT (key) DO NOTHING`.

### Auditoria
- Trigger `trg_audit_enrichment_suggestion` (`AFTER UPDATE OF status`) → grava em `team_audit_log` com `action = 'contact.enrichment.suggestion.<novo_status>'` e diff completo (`from_status`, `to_status`, `field_key`, `current/suggested_value`, `confidence`, `review_reason`).
- Função `audit_enrichment_suggestion_change()` marcada `SECURITY DEFINER` + `SET search_path = public` + `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` (invocada apenas pelo trigger).

### Triggers utilitários
- `set_updated_at()` (já existente) aplicado em `contact_enrichment_runs` e `contact_enrichment_suggestions`.

### Constraints
- `enrichment_confidence_range CHECK (confidence >= 0 AND confidence <= 1)` em `contact_enrichment_suggestions`.
- `UNIQUE(message_id)` em `contact_enrichment_runs` (idempotência por mensagem).

---

## Fora do escopo (permanecem congelados)

Runtime, Extractor Contract, integração LLM/STT/OCR, Server Functions, Event Bus, Realtime, UI Desktop, UI Mobile, Design System, Providers, Flow Engine, Inbox Engine. Nenhum arquivo `.ts/.tsx` foi alterado nesta fase — apenas migration SQL e types.gen.ts (auto-regenerado).

---

## Qualidade

- **Supabase linter:** 11 → 11 warnings (sem regressão). Função de auditoria não introduz warning novo — `EXECUTE` revogado.
- **Migration:** aplicada com sucesso.
- **Design das policies:** escrita 100% server-side via `service_role`; único caminho de mutação para membros autenticados é `UPDATE` de status em `suggestions` sob permissão explícita — impossível burlar via cliente.

---

## Próxima fase (aguardando autorização)

**Fase 2 — Extractor Contract + Runtime (server-only):**
- Interface `EntityExtractor` isolada (texto / STT / OCR).
- Runtime `enrichContactFromMessage()` disparado pós-persistência de mensagem.
- Regras de confiança parametrizadas (100/95/85/70/<70).
- Invariante: **nunca sobrescrever campo preenchido sem sugestão aprovada**.
- Testes unitários da matriz (campo vazio, divergência, confiança limítrofe, multi-entidade, idempotência por `message_id`).

⛔ **PARADO.** Congelamento arquitetural volta a valer. Aguardando autorização explícita para Fase 2.
