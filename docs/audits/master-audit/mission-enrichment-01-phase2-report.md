# Missão Enrichment-01 — Fase 2 (Extractor Contract + Runtime)

**Data:** 2026-07-16
**Escopo:** Contrato de extração de entidades + runtime de enriquecimento (server-only), 100% desacoplado de LLM/OCR/STT específicos, com política de confiança e testes.
**Autorização:** Descongelamento pontual — recomendação (A) mantida.

---

## Entregas

### 1. Contrato `EntityExtractor` (server-only)
`src/lib/enrichment/extractor-contract.server.ts`

- Interface única com um método assíncrono `extract(input) → ExtractionResult`.
- Types:
  - `EnrichmentSourceType` = `text_message | audio_transcript | ocr_document | ocr_image`.
  - `ExtractedEntity` = `{ field_key, value, confidence ∈ [0,1], evidence? }`.
  - `ExtractionResult` = `{ model, latencyMs, tokenUsage?, entities[] }`.
- Erros padronizados via `ExtractorError` com códigos `provider_error | invalid_response | transient | auth_error` + flag `retryable`.
- Zero acoplamento a Supabase, HTTP ou provider específico — permite injeção de stub em testes e swap futuro.

### 2. Política de confiança
`src/lib/enrichment/confidence.ts` (pure, sem I/O)

Regras conforme especificação do usuário:

| Situação | Confiança | Decisão |
|---|---|---|
| Campo vazio | ≥ 0.95 | **auto_apply** |
| Campo vazio | 0.70 – 0.95 | **suggest** |
| Campo preenchido, valor divergente | qualquer | **suggest** (nunca auto) |
| Campo preenchido, mesmo valor (normalizado) | qualquer | **ignore** (no-op) |
| Qualquer | < 0.70 | **ignore** |
| Valor extraído vazio | — | **ignore** |

**Invariante formal:** função `decideEnrichment()` nunca retorna `auto_apply` para campo não-vazio. Coberto por teste dedicado (`NEVER overwrites a filled field, even with confidence = 1.0`).

### 3. Registry de campos built-in
`src/lib/enrichment/field-registry.server.ts`

Escopo Fase 2 limitado às colunas nativas de `public.contacts`:
- `name`, `email`, `phone`, `company_name`, `job_title`.

Cada entrada tem `normalize()` + `validate()` (regex de email, comprimento mínimo, dígitos telefônicos com normalização BR).

Campos custom (CPF/CNPJ/RG/CEP/PIX/etc.) são reconhecidos pelo extractor mas registrados em `contact_enrichment_history` com `action='ignored'` e `reason='unknown_field'` — mantém observabilidade sem exigir mapeamento em `custom_fields`/`contact_field_values` (backlog para fase posterior).

### 4. Runtime `enrichContactFromMessage()`
`src/lib/enrichment/runtime.server.ts`

Fluxo:
1. **Upsert idempotente** em `contact_enrichment_runs` (chave `UNIQUE(message_id)`); runs `completed`/`processing` retornam `skipped`.
2. **Snapshot do contato** (colunas built-in) para comparação e para alimentar `known` no prompt.
3. **Chamada ao `EntityExtractor` injetado**; erro tipado → run marcada `failed` com código.
4. **Dedup por `field_key`** (mantém maior confiança).
5. **Avaliação por entidade** com `decideEnrichment()` + validação de formato.
6. **Persistência ordenada**: `UPDATE contacts` (só campos auto-aplicados) → `INSERT contact_enrichment_suggestions` (retorna IDs) → `INSERT contact_enrichment_history` (linka `suggestion_id`).
7. **Finalização**: run marcada `completed` com `model`, `latency_ms`, `token_usage`, `extracted_payload` (entidades + outcomes).
8. **Log estruturado JSON** com tag `contact-enrichment` (eventos `run_completed`, `run_skipped`, `extractor_failed`).

Invariantes garantidos em código:
- Único caminho de UPDATE em `contacts.*` filtrado por `id + company_id`.
- Suggestions são criadas apenas quando decisão é `suggest`; `pending` sempre.
- History é append-only server-side (grava via `service_role`, respeitando RLS da Fase 1).
- Zero fetch/HTTP no runtime — testável 100% com fakes.

### 5. Implementação LLM (opt-in, não wired)
`src/lib/enrichment/llm-extractor.server.ts`

Adapter que satisfaz `EntityExtractor` via Lovable AI Gateway (`generateText` + `Output.object`). Prompt system em português, threshold-aware, schema Zod mínimo (sem bounds — só shape, seguindo a regra `ai-sdk-agent-patterns`). Trata `NoObjectGeneratedError`, classifica erros em `transient` vs `provider_error`. **Não é chamado em nenhum pipeline nesta fase** — apenas disponível para wire-up na Fase 3.

---

## Testes

`bun test src/lib/enrichment/__tests__/`

| Arquivo | Casos | Cobertura |
|---|---|---|
| `confidence.test.ts` | 8/8 pass | Auto/suggest/ignore em todos os cortes, invariante campo-preenchido, normalização case-insensitive |
| `runtime.test.ts` | 10/10 pass | Auto-apply, invariante 1.0 → suggest, medium → suggest, below-threshold ignore, same-value no-op, unknown_field, dedup por confiança, idempotência `message_id`, extractor throw → failed sem lateral, validação de formato |

Suite total do projeto: **48/48 pass** (Enrichment 18 + Inbox-Delete 30, sem regressão).
Typecheck (`tsgo --noEmit`): **limpo**.

---

## Fora do escopo (permanecem congelados)

- Wire-up ao pipeline de mensagens (Event Bus / webhook / trigger DB) → Fase 4.
- Server Functions expostas (approve/reject suggestion, list history) → Fase 3.
- STT/OCR (audio_transcript e ocr_* aceitos no contrato mas sem provider produção) → Fase 3 + backlog ENR-BL-02.
- Realtime + UI Desktop/Mobile → Fases 4–6.
- Campos custom (CPF/CNPJ/etc.) mapeados para `contact_field_values` → backlog.
- Enriquecimento comercial (intenção, orçamento, humor…) → backlog ENR-BL-01 (Fase 7).

Nenhum arquivo tocado fora de `src/lib/enrichment/`. Nenhuma alteração em migrations, RLS, RBAC, providers, runtime existente, server functions, UI ou Design System.

---

## Próxima fase (aguardando autorização)

**Fase 3 — Server Functions + Realtime:**
- `createServerFn` para: listar sugestões pendentes (por contato / global), aprovar (`approve_suggestion`), rejeitar (`reject_suggestion`), configurar thresholds por empresa.
- Aplicação da sugestão aprovada: UPDATE em `contacts` + history(`applied_from_suggestion` com `actor_id`).
- Wire-up do runtime a partir do pipeline de mensagens (a decidir: trigger DB vs handler pós-persist).
- Escolha de provider OCR (backlog ENR-BL-02) precisa ser resolvida antes de habilitar `ocr_document`/`ocr_image`.

⛔ **PARADO.** Congelamento arquitetural restaurado. Aguardando autorização explícita.
