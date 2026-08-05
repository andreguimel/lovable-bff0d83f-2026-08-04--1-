# Missão Inbox-Delete-01 — Fase 2 (Provider Contract + Runtime)

**Status:** ✅ Concluída — aguardando autorização para Fase 3
**Data:** 2026-07-16
**Escopo autorizado:** Provider Contract, Runtime de exclusão, adaptadores Cloud/Evolution/Baileys, `dispatchDelete()`, persistência de ACK/erro nas colunas da Fase 1, retry apenas em erros previstos pelo provider, logs estruturados e telemetria.

---

## 1. Entregas

### 1.1 Provider Contract (`src/lib/wa-providers/deletion-contract.server.ts`)

Interface única `MessageDeletionProvider` com uma só operação:

```ts
delete(creds, peerPhone, req): Promise<MessageDeletionResult>
```

Códigos de erro padronizados (enum fechado):

| Código | Retryable? | Semântica |
|---|---|---|
| `unsupported_scope` | ❌ | Provider não expõe primitiva para este nível. |
| `missing_credentials` | ❌ | Credenciais ausentes/incompletas em `channels.credentials`. |
| `auth_error` | ❌ | Provider retornou 401/403. |
| `message_not_found` | ❌ | Provider retornou 404 (mensagem inexistente/já apagada). |
| `revoke_window_expired` | ❌ | Janela de revoke expirada (regra ~2 dias do WhatsApp). |
| `transient` | ✅ | 408/429/5xx ou exceção de rede. |
| `provider_error` | ❌ | Erro não classificado. |
| `invalid_payload` | ❌ | Falta `provider_message_id` ou `peer_phone`. |

Regras invariantes exigidas pelos adaptadores:
- `scope='inbox_only'` **nunca** faz chamada HTTP → `{ ok:true, skipped:true, provider_ack:null }`.
- `unsupported_scope` **nunca** é retornado como sucesso parcial.
- Exceções de rede são normalizadas em `{ ok:false, code:'transient', retryable:true }` — adaptadores nunca lançam.

### 1.2 Adaptadores

| Provider | `inbox_only` | `for_me` | `for_everyone` | Endpoint |
|---|---|---|---|---|
| **WhatsApp Cloud** | skipped | skipped (Cloud não tem primitiva) | **`unsupported_scope`** (Cloud API não expõe revoke público) | — |
| **Evolution** | skipped | skipped | `DELETE {base}/chat/deleteMessageForEveryone/{instance}` + header `apikey` | v2 |
| **Baileys** (via proxy HTTP) | skipped | `POST {base}/sessions/{s}/messages/delete-for-me` (404 → `unsupported_scope`) | `POST {base}/sessions/{s}/messages/delete` | proxy convencional Zenda |

Todos os adaptadores injetáveis: `createEvolutionDeletionProvider(fetchImpl)` e `createBaileysDeletionProvider(fetchImpl)` para testes sem tocar rede real.

**Reality check documentado nos arquivos**: WhatsApp Cloud API deliberadamente retorna `unsupported_scope` para `for_everyone` porque Meta hoje não expõe endpoint público de revoke. Quando expuserem, esse é o único ponto que muda.

### 1.3 `dispatchDelete()` (`src/lib/wa-providers/index.server.ts`)

Roteador único que:
1. Detecta o provider via `channel.provider_type`.
2. Curto-circuita `inbox_only` sem provider (retorna skipped).
3. Chama o adapter do map `DELETION_PROVIDERS`.
4. Providers desconhecidos ou canal `null` → `skipped:true` (nunca corrompe estado).

Também exporta `_createDispatchDeleteForTests(fetch)` para injeção em testes de integração.

### 1.4 Runtime — `src/lib/message-deletion.server.ts`

`deleteMessage(opts)` — orquestrador server-only:

1. Carrega mensagem (via cliente RLS) e valida `company_id` (belt-and-suspenders).
2. Idempotência: mensagem com `deleted_at` já preenchido retorna `ok:true, attempts:0` sem chamar provider.
3. Carrega `conversations` + `channels` para descobrir provider e credenciais.
4. Monta `MessageDeletionRequest { scope, provider_message_id, peer_phone, from_me, reason }`.
5. Loop de retry: chama `dispatch()` até `maxAttempts` (default 3) **apenas** se `result.retryable === true`. Backoff linear (default 500ms × tentativa).
6. Persistência (regra crítica):
   - **`ok:true`** → UPDATE `messages` com `deleted_at`, `deleted_by`, `deleted_scope`, `deleted_reason`, `provider_delete_ack` (real: `true`/`false`/`null`).
   - **`ok:false`** → **NÃO toca `deleted_at`**; só anota `provider_delete_ack=false` e `provider_delete_error='<code>: <msg>'` para observabilidade. Integridade da mensagem preservada.
7. Sempre INSERE linha em `message_deletions` (sucesso ou falha) — histórico auditável imutável.
8. Logs estruturados JSON com tag `inbox-delete` em cada etapa: `delete.start`, `delete.provider_attempt`, `delete.provider_ok`, `delete.provider_fail`, `delete.done`, etc. — pronto para consumo por observabilidade futura sem alteração de código.

**Retorno**: `DeleteMessageOutcome { ok, scope, provider, provider_ack, attempts, duration_ms, error?, error_code?, message_id }`. Nunca lança em falha de provider — deixa a decisão de apresentação para a Fase 3.

---

## 2. Contrato "Nunca marcar sucesso sem ACK"

| Cenário | `deleted_at` | `provider_delete_ack` | `message_deletions` |
|---|---|---|---|
| `inbox_only` (sempre) | ✅ preenchido | `null` | inserido |
| `for_me` em Evolution (skipped) | ✅ preenchido | `null` | inserido |
| `for_me` em Baileys 200 | ✅ preenchido | `true` | inserido |
| `for_everyone` em Cloud (unsupported) | ❌ **NULL** | `false` | inserido (com erro) |
| `for_everyone` em Evolution 200 | ✅ preenchido | `true` | inserido |
| `for_everyone` em Evolution 503 (após 3 retries) | ❌ **NULL** | `false` | inserido (com erro) |
| `for_everyone` em Evolution 401 (sem retry) | ❌ **NULL** | `false` | inserido (com erro) |

---

## 3. Testes (Bun test, zero-config, sem alteração de build)

**Resultado:** ✅ **30/30 pass**, 93 asserts, 58ms.

### `src/lib/wa-providers/__tests__/deletion-contract.test.ts` (23 testes)
- Helpers: `skippedResult`, `unsupportedScope`, `missingCredentials`, `invalidPayload`, `classifyHttpFailure` (401 → auth_error, 404 → message_not_found, 429/5xx → transient retryable, "expired" → revoke_window_expired).
- **WhatsApp Cloud**: 3 cenários (inbox_only skipped, for_me skipped, for_everyone unsupported_scope).
- **Evolution**: 7 cenários (skips, DELETE 200 → ack:true, missing_credentials, invalid_payload, 401 auth_error, 503 transient/retryable, network throw → transient/retryable).
- **Baileys**: 6 cenários (skip inbox_only, POST for_everyone 200 → ack:true, endpoint distinto para for_me, 404 for_me → unsupported_scope, Bearer opcional, network throw → transient/retryable).

### `src/lib/wa-providers/__tests__/message-deletion-runtime.test.ts` (7 testes)
- `inbox_only`: soft-delete local + ack=null + histórico inserido.
- `for_everyone` com ACK: soft-delete local + ack=true.
- `for_everyone` unsupported: **NÃO** soft-delete; anota erro no message row + histórico.
- Retry: 3 tentativas em transient, respeita `maxAttempts`.
- Non-retryable: 1 tentativa apenas (auth_error).
- Idempotência: mensagem já deletada retorna ok sem chamar dispatch.
- Cross-company: rejeita com `auth_error` (belt-and-suspenders além do RLS).

Comando: `bun test src/lib/wa-providers/__tests__/`.

---

## 4. Verificações

| Item | Resultado |
|---|---|
| Build tooling | Inalterado |
| Typecheck (`bunx tsgo --noEmit`) | ✅ verde |
| Unit tests | ✅ 30/30 pass |
| Regressão em `dispatchSend` | ❌ Nenhuma — função e imports preservados |
| Migrations criadas nesta fase | ❌ Nenhuma (usa apenas colunas/tabelas da Fase 1) |
| Alterações em UI/Desktop/Mobile | ❌ Nenhuma |
| Alterações em Event Bus | ❌ Nenhuma (Fase 3) |
| Alterações em Server Functions públicas | ❌ Nenhuma (Fase 3) |
| Alterações em RBAC/RLS | ❌ Nenhuma |
| Alterações em Design System | ❌ Nenhuma |

**Nota de tooling:** adicionado `"exclude": ["src/**/__tests__/**"]` em `tsconfig.json` para permitir `import ... from "bun:test"` nos arquivos de teste sem afetar o build da aplicação. Nenhuma dependência foi adicionada, nenhum outro campo alterado.

---

## 5. Regressão em envio

O código `sendViaWhatsAppCloud` / `dispatchSend` não foi tocado semanticamente — apenas os imports do topo de `index.server.ts` cresceram (adaptadores de deleção). Assinaturas e comportamento de envio 100% preservados.

---

## 6. Arquivos afetados

Criados:
- `src/lib/wa-providers/deletion-contract.server.ts`
- `src/lib/wa-providers/whatsapp-cloud-delete.server.ts`
- `src/lib/wa-providers/evolution-delete.server.ts`
- `src/lib/wa-providers/baileys-delete.server.ts`
- `src/lib/message-deletion.server.ts`
- `src/lib/wa-providers/__tests__/deletion-contract.test.ts`
- `src/lib/wa-providers/__tests__/message-deletion-runtime.test.ts`
- `docs/audits/master-audit/mission-inbox-delete-01-phase2-report.md`

Editados:
- `src/lib/wa-providers/index.server.ts` (adiciona `dispatchDelete`, sem tocar `dispatchSend`)
- `tsconfig.json` (exclui `src/**/__tests__/**` para permitir `bun:test`)
- `docs/audits/master-audit/production-verdict.md`

---

## 7. Backlog gerado por esta fase

Nenhum requisito novo descoberto. Observações para fases seguintes (não bloqueiam):
- **Fase 3** precisará wire-up: server functions (`softDeleteMessage`, `listMessageDeletions`), event bus (`message.deleted.*`) e realtime (broadcast → invalidate na Inbox).
- **Fase 4** precisará: menu contextual (WhatsApp-like), confirmações, empty/error states, componente `deleted-message` (tombstone).
- **Fase 5**: E2E Playwright com mocks dos provider stubs.

---

## 8. Próximo passo (aguardando autorização)

**Fase 3 — Server Functions + Event Bus + Realtime + Histórico + Logs.**

> ⛔ **PARADO.** Aguardando autorização explícita para iniciar a Fase 3.
> Fila Mobile-6.5 → Mobile-8 → RC Final e trilha Runtime-02.2..02.6 continuam congeladas.
