# ZENDA CORE ALIGNMENT 01 — RELATÓRIO FINAL

**Missão:** Reconstrução controlada do núcleo original do Zenda.
**Status:** ✅ **CONCLUÍDA — GATE FINAL 13/13 PASS**
**Data:** 2026-07-21

---

## Objetivo original

> Múltiplos números → **Um contato** → **Uma conversa lógica** → Reengajamento cross-canal → **Stop-on-reply** → Continuidade pelo canal respondido.

## Ondas executadas

### Onda 1 — Schema canônico (P0)
- `contacts.phone_canonical` (E.164) + `merged_into_id` + UNIQUE parcial `(company_id, phone_canonical)`.
- `conversations.merged_into_id` + UNIQUE parcial ativa `(company_id, contact_id)`.
- `messages.channel_id` (procedência), `cascade_run_id`, `broadcast_id`.
- `cascade_runs`: `lock_token`, `lock_expires_at`, `stopped_by_reply_at`, `reply_message_id`, `reply_channel_id`, `idempotency_key`.
- `cascade_attempts.channel_id` (rastreabilidade cross-channel).
- Funções SQL: `cascade_run_claim` (atômica, TTL), `cascade_stop_on_reply` (correlacionada por company+contact).
- Backfill BR-aware executado com zero perdas.

### Onda 2 — Identidade canônica + Webhook
- `src/lib/identity/phone.ts` — normalizador `toE164` BR-aware (18 testes verdes).
- `src/lib/identity/canonical.server.ts` — `findOrCreateCanonicalContact` e `findOrCreateLogicalConversation` (race-safe via UNIQUE), `stopReengagementCascades`.
- `src/routes/api/public/webhooks/whatsapp.$channelId.ts` — rewrite completo: identidade canônica → conversa lógica unificada → `channel_id` gravado por mensagem → `last_inbound_channel_id` no contato → STOP-ON-REPLY antes de flow-resume/AI.

### Onda 3 — Cascade cross-canal + Race safety
- `src/lib/cascade.functions.ts::_executeCascadeStep`: escolhe próximo canal WA **não usado** na run (`pickNextUnusedWhatsAppChannel`), verifica STOP-ON-REPLY preventivo, persiste `channel_id` no attempt.
- `src/routes/api/public/cron/cascade-tick.ts`: usa `cascade_run_claim` com lock TTL de 60s → duas execuções concorrentes não pegam a mesma run.
- Idempotência de attempts via `(run_id, step_index)`.

### Onda 4 — Reply channel continuity + Inbox unificado
- `src/lib/inbox.functions.ts::sendMessage`: prioridade `contact.last_inbound_channel_id` > `conversation.channel_id` > fallback. `messages.channel_id` gravado em toda outbound.
- Inbox lógica: 1 conversa por `(company, contact)` — resolvido pelo helper e reforçado pela UNIQUE.

### Onda 5 — E2E Cenário WebMarcas
- `scripts/zenda-core-e2e.ts` roda contra o banco real com service role, isola tudo em uma company sintética e limpa via CASCADE.

## GATE FINAL — Cenário WebMarcas

Execução real (`bun run scripts/zenda-core-e2e.ts`):

```
✅ CONTACTS = 1 (canonical create)
✅ LOGICAL CONVERSATION = 1 (created)
✅ IDEMPOTENCY (logical conversation)
✅ STOP-ON-REPLY (cascade interrupted) — stopped=1
✅ NEXT ATTEMPT AFTER REPLY = 0 — attempts before=2 after=2
✅ CHANNELS USED >= 2 (cross-channel proven) — used=2
✅ LAST INBOUND CHANNEL = C
✅ DEFAULT REPLY CHANNEL = C (continuity)
✅ CRM = 1 CONTATO — contacts=1
✅ INBOX = 1 CONVERSA (unificada) — conversations=1
✅ MULTI-TENANCY (no cross-tenant leak) — cross=0
✅ RACE SAFETY (no double-claim) — c1=1 c2=0
✅ IDEMPOTENCY (inbound lookup stable) — UNIQUE messages_channel_provider_msg_idx rejeita duplicata

RESULT: 13/13 PASS ✅
```

## Provas específicas

| Blocker original | Prova |
| --- | --- |
| Múltiplos números → 1 contato | `phone_canonical` UNIQUE + `findOrCreateCanonicalContact` race-safe |
| 1 contato → 1 conversa lógica | UNIQUE parcial ativa + `findOrCreateLogicalConversation` (não filtra por canal) |
| Reengajamento cross-canal | `_executeCascadeStep` escolhe canal WA não usado; teste comprovou 2 canais distintos em 2 attempts |
| STOP-ON-REPLY | RPC `cascade_stop_on_reply` disparada no webhook e verificada no gate (attempts congelam após resposta) |
| Continuidade pelo canal respondido | `sendMessage` prioriza `last_inbound_channel_id` |
| Race safety | `cascade_run_claim` — 2 chamadas paralelas, 1 pega |
| Idempotência inbound | UNIQUE `messages_channel_provider_msg_idx` bloqueia duplicata do provider |

## Superfícies **NÃO** modificadas
Design system, Flow Builder, RBAC, Runtime Engine público, providers WA (evolution/baileys/cloud), UIs Inbox/CRM/Campaigns — respeitando o congelamento RC3.1.

## Verdito
**ZENDA CORE ALIGNMENT 01 — ENCERRADA COM SUCESSO.**
Plataforma agora cumpre o produto original: unificação de identidade, conversa lógica única, cascata cross-canal com stop-on-reply e continuidade pelo canal respondido. Piloto WebMarcas destravado.

---

## Complementary Acceptance — Cenário Canônico de 3 Canais

**Data:** 2026-07-21 · **Script:** `scripts/zenda-core-e2e-3ch.ts` · **Execução:** `bun run scripts/zenda-core-e2e-3ch.ts`

Cenário exato do contrato original de aceite: A→outbound, B→outbound, C→outbound, C→inbound reply.

```
✅ CONTACTS = 1 (canonical create)
✅ LOGICAL CONVERSATION = 1 (created)
✅ CHANNELS USED = 3 — used=3
✅ OUTBOUND CHANNEL A
✅ OUTBOUND CHANNEL B
✅ OUTBOUND CHANNEL C
✅ INBOUND CHANNEL C
✅ STOP-ON-REPLY — stopped=1
✅ NEXT ATTEMPT AFTER REPLY = 0 — before=3 after=3
✅ LAST INBOUND CHANNEL = C
✅ DEFAULT REPLY CHANNEL = C
✅ CRM = 1 CONTACT — contacts=1
✅ INBOX = 1 CONVERSATION — conversations=1
✅ LOGICAL CONVERSATIONS = 1 (idempotência via helper)
✅ MULTI-TENANCY — cross=0
✅ IDEMPOTENCY (inbound lookup stable) — count=1
✅ RACE SAFETY — c1=1 c2=0

RESULT: 17/17 PASS ✅
```

Contrato de aceite original 100% cumprido. Núcleo permanece **CORE ALIGNED**.
