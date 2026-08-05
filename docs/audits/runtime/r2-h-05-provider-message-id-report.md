# R2-H-05 — Persistência de `provider_message_id` outbound (Runtime)

**Data:** 2026-07-16
**Prioridade:** 🟠 Alto operacional (backlog)
**Status:** ✅ RESOLVIDO

---

## 1. Problema

`flow-executor.server.ts` inseria a mensagem outbound em `messages` **antes** de chamar `dispatchSend`, e nunca voltava para gravar o `provider_message_id` que o provedor retornava. Efeito prático: os webhooks de `delivered/read/failed` do WhatsApp Cloud chegavam com `wamid.*`, mas não havia como amarrá-los à linha `messages` correspondente, e o status permanecia `sent` para sempre. Também impedia `Excluir para todos` (revoke) em mensagens automatizadas — o adapter exige o `provider_message_id`.

Referências:
- `docs/audits/runtime/runtime-02-report.md` §R2-H-05
- `docs/audits/runtime/runtime-final-validation.md` §Inbox 🟡
- Código: `src/lib/flow-executor.server.ts` linhas 199-208 (message) e 249-266 (mídia).

## 2. Escopo aplicado

Escopo fechado — **somente R2-H-05**. Nenhuma mudança em:
- Schema, RLS, GRANTs, migrations (a coluna `messages.provider_message_id` e o índice único parcial já existiam).
- Adapters de provider (`dispatchSend` já retornava `provider_message_id`).
- Frontend / RBAC / Event Bus / Design System.
- Semântica de falha (F-SYNTH-05 permanece no backlog Low).

## 3. Correção

`src/lib/flow-executor.server.ts` — plugins `messageNode` e `mediaNode`:

1. O `INSERT` em `messages` agora encadeia `.select("id").single()` e guarda `insertedMessageId`.
2. Após `dispatchSend` retornar `ok=true`, se `providerInfo.provider_message_id` estiver presente, executa `UPDATE messages SET provider_message_id = ? WHERE id = ?`.
3. Comportamento quando o provedor devolve `skipped: true` / id nulo: nenhum UPDATE (evita gravar `null` desnecessariamente e preserva a idempotência do índice único parcial `messages_channel_provider_msg_idx`).

Diff efetivo: +34 / -6 linhas em um único arquivo.

## 4. Testes

Novo: `src/lib/__tests__/flow-executor-provider-id.test.ts` (bun:test, sem I/O real).
Usa `mock.module("@/lib/wa-providers/index.server", ...)` para injetar um `dispatchSend` controlável e um cliente Supabase mock que registra `insert`s e `update`s.

```
$ bun test ./src/lib/__tests__/flow-executor-provider-id.test.ts
(pass) R2-H-05 > message node persists provider_message_id after dispatch
(pass) R2-H-05 > media node persists provider_message_id after dispatch
(pass) R2-H-05 > skips UPDATE when provider returns no id
 3 pass · 0 fail
```

Regressão — suíte completa do Runtime/Providers/Inbox:

```
$ bun test src/lib/wa-providers/__tests__ src/lib/__tests__
 37 pass · 0 fail   (contract test, deletion runtime, delete functions,
                     flow-resume-inbound, R2-H-05)

$ bunx tsgo --noEmit
 (sem erros)
```

## 5. Impacto operacional

| Superfície | Antes | Agora |
|---|---|---|
| `messages.provider_message_id` outbound (fluxos) | sempre `NULL` | preenchido com o `wamid` retornado pelo provedor |
| ACK de `delivered/read/failed` amarrando ao inbox | ❌ não fechava | ✅ `provider_message_id` casa com `wamid` do webhook |
| Excluir para todos em mensagens automatizadas | ❌ (`invalid_payload: provider_message_id ausente`) | ✅ o adapter recebe o id e revoga |
| Idempotência de webhooks (índice único parcial) | ✅ (não regride) | ✅ (não regride) |

## 6. Cobertura Runtime (atualizada)

| Item | Antes | Agora |
|---|---|---|
| Scheduler / WAIT / WAIT_REPLY | 🟢 | 🟢 |
| Providers (send + delete) | 🟢 | 🟢 |
| Rastreamento outbound → ACK | 🟡 (R2-H-05) | 🟢 |
| Runtime P0/Critical/High | 0 P0/Critical, 1 High (R2-H-05) | **0 P0 / 0 Critical / 0 High** |

## 7. Encerramento

- Missão **Encerrada**.
- Sem sub-missões abertas em cascata.
- Não iniciada nenhuma outra missão. Aguardando autorização explícita.
