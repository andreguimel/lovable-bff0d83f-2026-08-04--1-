# FLOW-RUNTIME-ROOTCAUSE — prova de execução real

**Status:** Encerrada após prova E2E autenticada.

## Causa raiz encontrada

Existia mais de um caminho de execução de fluxo:

- **Inbox composer:** `runFlowOnConversation` → `createAndExecuteRun` → versão publicada pinada.
- **Transferência no Inbox:** `transferConversation` criava `flow_runs` diretamente e caminhava `flow_nodes/flow_edges` live, sem `published_version_id`, sem `flow_versions` e sem runtime oficial.

Esse segundo caminho mantinha divergência entre “fluxo ativo” e “versão publicada” e explicava por que o erro ainda podia aparecer em ações iniciadas a partir do Inbox.

## Correção aplicada

- `transferConversation` agora chama `createAndExecuteRun`, usando o mesmo resolvedor de versão publicada do Inbox/manual.
- `listActiveFlows` da transferência agora retorna apenas fluxos `active` com versão `published`.
- `createAndExecuteRun` passou a usar um resolvedor único instrumentado para `flow_versions`.
- Desktop e mobile registram o clique real em “Executar Fluxo” com `workspace_id`, `organization_id`, `conversation_id`, `flow_id`, `flow_version_id`, `trigger_id` e usuário.
- Backend registra função chamada, parâmetros, SQL, linhas retornadas, versão/status encontrados e motivo exato quando não encontra publicação.

## Respostas objetivas

- **Função que lançava a exceção:** `createAndExecuteRun`.
- **Arquivo:** `src/lib/flow-executor.server.ts`.
- **Linha atual:** bloco `PublishedVersionNotFound` dentro de `createAndExecuteRun`.
- **SQL executado:**

```sql
SELECT id, version_number, status, published_at, integrity_hash, snapshot
FROM public.flow_versions
WHERE flow_id = $1 AND status = 'published'
ORDER BY published_at DESC NULLS LAST, version_number DESC
LIMIT 1
```

- **Linhas retornadas na prova:** `1`.
- **Status da versão encontrada:** `published`.
- **flow_id recebido é o mesmo do fluxo aberto na UI:** sim — `72043d7c-c1b0-4830-9835-8758fb9aab78`.

## Prova E2E autenticada

Script: `/tmp/browser/flow-runtime-proof/proof.py`.

Fluxo validado:

- `FLOW-RUNTIME-ROOTCAUSE mínimo`
- `flow_id = 72043d7c-c1b0-4830-9835-8758fb9aab78`
- versão publicada: `566202f1-7ef4-4549-9def-1a0abadba027`
- conversa: `712394e1-29f5-4ee3-8eaa-226aff15c7b8`

Resultado novo gerado pelo clique do Inbox:

- `run_id = 3324b59e-2e68-40a3-b392-26da99f83485`
- `trigger_type = inbox`
- `status = completed`
- `state = COMPLETED`
- `error = null`
- `published_version_id = 566202f1-7ef4-4549-9def-1a0abadba027`
- `published_version_number = 1`
- `steps = 3`

Eventos do runtime:

1. `RuntimeRunCreated`
2. `RuntimeVersionResolved`
3. `RuntimeGraphResolved` com `source = published_version`
4. `RuntimeEntryNodeResolved`
5. `NodeStarted` / `NodeFinished` — `start`
6. `NodeStarted` / `NodeFinished` — `message`
7. `NodeStarted` / `NodeFinished` — `end`
8. `FlowCompleted`

## Evidências visuais

- Fluxo publicado/ativo: `/tmp/browser/flow-runtime-proof/screenshots/1_flow_active.png`
- Inbox aberto: `/tmp/browser/flow-runtime-proof/screenshots/2_inbox_open.png`
- Menu de fluxos no Inbox: `/tmp/browser/flow-runtime-proof/screenshots/3_flow_menu_open.png`
- Após executar sem erro: `/tmp/browser/flow-runtime-proof/screenshots/4_after_execute.png`

## Arquivos alterados

- `src/lib/flow-executor.server.ts`
- `src/lib/inbox.functions.ts`
- `src/lib/transfers.functions.ts`
- `src/components/inbox/message-composer.tsx`
- `src/components/inbox/mobile/mobile-message-composer.tsx`
- `docs/audits/inbox/FLOW-RUNTIME-ROOTCAUSE-proof-report.md`

## Decisão

**Encerrada.** O caminho divergente do Inbox foi unificado ao runtime oficial e há prova autenticada de execução do primeiro ao último nó sem a mensagem “Fluxo não possui versão publicada”.