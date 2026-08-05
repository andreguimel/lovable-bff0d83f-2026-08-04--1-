# Missão Enrichment-01 · Fase 3 — Server Functions + Realtime

**Data:** 2026-07-16
**Escopo autorizado:** APIs de leitura/aprovação/rejeição de sugestões + habilitação de Realtime nas tabelas de enriquecimento.
**Status:** ✅ **Encerrada**

---

## Entregas

### 1. Migration — Realtime nas tabelas de enriquecimento

Arquivo: `supabase/migrations/*_enrichment_realtime.sql` (aprovada e aplicada).

```sql
ALTER TABLE public.contact_enrichment_suggestions REPLICA IDENTITY FULL;
ALTER TABLE public.contact_enrichment_runs        REPLICA IDENTITY FULL;
ALTER TABLE public.contact_enrichment_history     REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_enrichment_suggestions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_enrichment_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_enrichment_history;
```

- **RLS/GRANT:** nada alterado. As policies da Fase 1 continuam sendo o único portão de leitura.
- **Linter Supabase:** 11 warnings pré-existentes (helpers `SECURITY DEFINER` by-design + `pg_net`). **Zero regressão.**

### 2. Server functions — `src/lib/enrichment.functions.ts`

Todas as funções usam `.middleware([requireSupabaseAuth])`. Validação de entrada via Zod.

| Função | Método | Escopo RLS | Efeitos |
|---|---|---|---|
| `listPendingEnrichmentSuggestions({ contactId?, limit? })` | GET | `enrichment_sugg_select_company` | leitura de sugestões `pending` |
| `listContactEnrichmentHistory({ contactId, limit? })` | GET | `enrichment_hist_select_company` | leitura append-only |
| `approveEnrichmentSuggestion({ suggestionId, overrideValue? })` | POST | UPDATE exige `contacts.enrichment.review` | patch em `contacts` + status `approved` + history `applied_from_suggestion` |
| `rejectEnrichmentSuggestion({ suggestionId, reason? })` | POST | idem | status `rejected` + history `rejected` |

**Lógica extraída em helpers puros** (`applyApproval` / `applyRejection`) para testabilidade sem Supabase real. Handlers são thin wrappers que resolvem os clients request-scoped e delegam.

### 3. Invariantes

- **Field registry** (Fase 2) reutilizado: valor da sugestão passa por `normalize` + `validate` antes de qualquer escrita. Campo custom (CPF/CNPJ/…) → `unsupported_field` throw, zero side-effects.
- **Idempotência:** sugestão já revisada retorna `{ status, alreadyReviewed: true }` sem tocar em nada. `UPDATE ... WHERE status='pending'` bloqueia clobber em corrida.
- **Write-split respeitado:** `contact_enrichment_history` continua sem policy de INSERT para `authenticated` — inserção via `supabaseAdmin` (dynamic import dentro do handler, sem leak no client bundle).
- **actor_id preenchido** em toda transição — trigger de auditoria da Fase 1 grava `team_audit_log` automaticamente.

---

## Testes

`bun test src/lib/enrichment/__tests__/`

| Arquivo | Casos | Cobertura |
|---|---|---|
| `server-functions.test.ts` | **8/8 pass** | Approve happy-path (normalização + patch + status + history), override com `review_reason=approved_with_override`, idempotência approved, campo não suportado, valor inválido (formato), sugestão inexistente, rejeição com reason, idempotência rejected |
| `runtime.test.ts` (Fase 2) | 10/10 pass | Sem regressão |
| `confidence.test.ts` (Fase 2) | 8/8 pass | Sem regressão |

Suite total do projeto: **56/56 pass** (Enrichment 26 + Inbox-Delete 30). Typecheck `tsgo --noEmit`: **limpo**.

---

## Fora do escopo (permanecem congelados)

- **Wire-up ao pipeline de mensagens** (chamar `enrichContactFromMessage` após persist de mensagem) → **Fase 4**.
- **UI Desktop/Mobile** (fila de revisão, badge no CRM, drawer no Inbox) → **Fases 5–6**.
- **Configuração de thresholds por empresa** — decisão adiada: exigiria nova tabela/coluna e cai fora do escopo Fase 3. Backlog: `ENR-BL-03 — Thresholds configuráveis por empresa`.
- **Provider OCR/STT** (`ocr_document`, `ocr_image`, `audio_transcript`) → backlog `ENR-BL-02`.
- **Campos custom em `contact_field_values`** → backlog.
- **Enriquecimento comercial** (intenção, objeções, humor…) → backlog `ENR-BL-01` (Fase 7).

Nenhum arquivo tocado fora de `src/lib/enrichment.functions.ts`, `src/lib/enrichment/__tests__/`, migration, `docs/audits/master-audit/*.md`. Zero mudança em RLS/RBAC estruturais, providers, runtime existente de mensagens, UI ou Design System.

---

## Próxima fase (aguardando autorização)

**Fase 4 — Wire-up ao pipeline de mensagens + consumer Realtime:**
- Decisão pendente: chamar `enrichContactFromMessage` a partir do handler que persiste `messages` (síncrono não-bloqueante) vs trigger DB → server route `/api/public/enrichment/tick`. Recomendação: handler pós-persist, com `waitUntil` (Cloudflare) para não bloquear resposta do webhook.
- Escolha de provider OCR (backlog `ENR-BL-02`) antes de habilitar `ocr_document`/`ocr_image`.
- Nenhum UI ainda — apenas plumbing.

⛔ **PARADO.** Congelamento arquitetural restaurado.
