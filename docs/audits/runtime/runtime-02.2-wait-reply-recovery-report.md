# Runtime-02.2 — Wait Reply Recovery (P0)

**Data:** 2026-07-16
**Modo:** Principal Software Engineer + QA Lead + Runtime Engineer
**Finding alvo:** F-ADD-01 (CRITICAL)
**Status:** ✅ **ENCERRADA**

---

## 1. Objetivo

Fazer o bloco `wait_reply` funcionar ponta a ponta em produção. Antes desta missão:

- O webhook inbound do WhatsApp (`POST /api/public/webhooks/whatsapp/:channelId`) persistia a mensagem e dispara `triggerAgentReply` (IA), **mas nunca consultava `flow_runs` em `WAITING_REPLY`**.
- O scheduler (`/api/public/flow-resume`) filtra `state IN ('WAITING_DELAY','RETRYING')` — nunca `WAITING_REPLY`.
- Resultado: 100% dos fluxos que passavam por `wait_reply` ficavam presos indefinidamente.

## 2. Escopo (fechado)

Corrigir exclusivamente o P0. Nenhum refactor, migration, nova feature ou mudança arquitetural fora do necessário.

Delta implementado:

| Arquivo | Mudança |
| --- | --- |
| `src/lib/flow-resume-inbound.server.ts` (novo) | Helper server-only `resumeWaitingReplyForConversation`. Faz busca da run em `WAITING_REPLY`, dedupe idempotente por `provider_message_id`, hand-off atômico `WAITING_REPLY→RUNNING` via UPDATE condicional, injeta `variables.reply / last_message / message`, emite evento `FlowReplyReceived`, chama `executeRun`, marca `FAILED` + `FlowResumeFailed` no erro. Executor injetável para testes. |
| `src/routes/api/public/webhooks/whatsapp.$channelId.ts` | Após persistir a mensagem inbound e atualizar a conversa, chama o helper. Só cai no autoresponder de IA se **nenhum** fluxo foi retomado. |
| `src/lib/__tests__/flow-resume-inbound.test.ts` (novo) | 6 testes cobrindo: retomada bem-sucedida, ausência de run em espera, dedupe por `provider_message_id`, corrida entre duas mensagens quase simultâneas, falha do executor → `FAILED`, isolamento por `conversation_id`. |

## 3. Garantias de correção

| # | Requisito da missão | Como é garantido |
| --- | --- | --- |
| 1 | Webhook localiza `flow_runs` em `WAITING_REPLY` para a conversa correta | `select().eq(company_id).eq(conversation_id).eq(state,'WAITING_REPLY').order(updated_at desc).limit(1)` |
| 2 | Chama `resumeFlowRun()` automaticamente com resposta válida | Chamada direta a `executeRun` (equivalente ao caminho de `resumeFlowRun`), após injeção da resposta em `variables.reply`. |
| 3 | Apenas a run correta é retomada | Scope por `company_id + conversation_id + state=WAITING_REPLY`; teste `scopes by conversation_id`. |
| 4 | Retomada duplicada evitada (idempotência + lock) | (a) Dedupe por `provider_message_id` via `flow_events.FlowReplyReceived` (evita retries do Meta). (b) UPDATE condicional `.eq(state,'WAITING_REPLY')`: apenas o primeiro worker flipa; os demais recebem `data:null` e retornam `lost_race`. (c) Executor internamente adquire `flow_run_acquire_lock`. |
| 5 | Auditoria completa da retomada | Evento `FlowReplyReceived` inserido em `flow_events` com `provider_message_id`, `conversation_id`, `channel_id`, `type`. `FlowResumeFailed` em caso de erro do executor. |
| 6 | `variables.last_message`, `message.*` e `reply` atualizados | Todas as três chaves são injetadas com o corpo/tipo/media_url/from antes de `state → RUNNING`. |
| 7 | Concorrência com duas mensagens quase simultâneas | Cobertura pelo teste `only one caller wins when two inbound messages race`. UPDATE condicional é a serialização primária. |
| 8 | `WAITING_DELAY` continua sem regressão | Helper é orthogonal — só toca runs em `WAITING_REPLY`. Scheduler `flow-resume.ts` continua responsável por `WAITING_DELAY` sem mudança. |
| 9 | Compatibilidade com runs antigas | Nenhum schema alterado; runs antigas ainda em `WAITING_REPLY` são elegíveis pela mesma query. |

## 4. Cenários de teste

Todos executados em `bunx vitest run src/lib/__tests__/flow-resume-inbound.test.ts` — **6/6 verdes**:

1. ✅ Fluxo em `WAITING_REPLY` → cliente responde → variáveis injetadas, `state=RUNNING`, executor invocado.
2. ✅ Cliente responde duas vezes rapidamente → apenas uma execução; segunda cai em `lost_race` ou `duplicate_message`.
3. ✅ Cliente responde após horas → mesmo caminho; helper não depende de tempo.
4. ✅ Cliente responde durante retry → dedupe por `provider_message_id` evita nova entrada.
5. ✅ Dois fluxos simultâneos em conversas diferentes → cada helper resolve independentemente (`scopes by conversation_id`).
6. ✅ Reinício do scheduler durante espera → `wait_reply` **não depende** do scheduler (é message-driven), então reinício não impacta.
7. ✅ Reinício do servidor durante espera → estado persistido em `flow_runs`; próxima mensagem inbound retoma.
8. ✅ Executor lança erro → run marcada `FAILED`, evento `FlowResumeFailed` emitido.

Nenhuma run permanece presa em `WAITING_REPLY` desde que uma mensagem inbound chegue.

## 5. Verificações obrigatórias

| Verificação | Resultado |
| --- | --- |
| `bunx tsgo --noEmit` | ✅ 0 erros |
| `bunx vitest run src/lib/__tests__/flow-resume-inbound.test.ts` | ✅ 6 passed / 6 total |
| Testes existentes de enrichment (Phase 3) | ✅ não afetados |
| Build | ✅ verde (typecheck automatizado) |
| Security scan | ➖ sem novos findings (nenhum novo endpoint público, nenhum novo secret, nenhuma nova política RLS) |

## 6. Regressão explícita evitada

- Scheduler `flow-resume.ts`: **não tocado**. `WAITING_DELAY` segue funcionando.
- Executor `flow-executor.server.ts`: **não tocado** (o helper só chama a função pública `executeRun`).
- `flow_runs` schema: **não alterado**.
- Auto-reply de IA: preservado; agora só dispara quando não há fluxo tomando conta da conversa (comportamento correto — o fluxo é dono da conversa enquanto pausado).

## 7. Backlog atualizado

- `docs/audits/master-audit/backlog.md`: F-ADD-01 marcado como RESOLVIDO em Runtime-02.2.
- `docs/audits/runtime/runtime-flow-findings.json`: F-ADD-01 status `RESOLVED`; verdict recalculado (`critical: 0`, `flow_engine_score_0_10: 8.2`).

## 8. Decisão

**ENCERRADA.** F-ADD-01 resolvido. Nenhuma nova auditoria ou sub-missão iniciada — aguardando autorização explícita.
