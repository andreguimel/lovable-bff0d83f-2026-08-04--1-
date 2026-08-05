# FLOW-RUNTIME-ROOTCAUSE — Relatório de conclusão

Data: 2026-07-17  
Status: **Encerrada**

## Escopo

Eliminar a falha real em que o Inbox tentava executar um fluxo exibido como ativo, mas o Runtime não encontrava versão publicada e lançava:

> Fluxo não possui versão publicada. Publique uma versão antes de executar em produção.

## Função exata onde ocorria a falha

- **Função:** `createAndExecuteRun`
- **Arquivo:** `src/lib/flow-executor.server.ts`
- **Trecho:** consulta de `flow_versions` filtrando `flow_id = opts.flowId` e `status = 'published'`.
- **Condição que falhava:** `if (!pub)` após a query da versão publicada.
- **Mensagem original:** `Fluxo não possui versão publicada. Publique uma versão antes de executar em produção.`

## SQL envolvido

```sql
select id, version_number, integrity_hash, snapshot
from public.flow_versions
where flow_id = :flow_id
  and status = 'published'
order by published_at desc
limit 1;
```

## Causa raiz

Havia dois conceitos desacoplados:

1. **Estado visual/operacional do fluxo:** `public.flows.status = 'active'`.
2. **Publicação real executável pelo Runtime:** linha em `public.flow_versions` com `status = 'published'` e `published_at` preenchido.

O botão **Publicar** do editor desktop e mobile ainda chamava apenas `setFlowStatus({ status: 'active' })`. Isso podia deixar a UI mostrando o fluxo como ativo sem criar o snapshot publicado em `flow_versions`.

O Runtime estava correto ao recusar a execução: ele só executa produção a partir de versão publicada pinada.

## Auditoria de publicação

Schema confirmado:

- `flows`: não possui `published_version_id`, `current_version_id` ou `latest_version_id`.
- `flow_versions`: armazena publicação real via `status`, `snapshot`, `integrity_hash`, `published_at`.
- `flow_runs`: armazena a versão pinada da execução via `published_version_id`, `published_version_number`, `graph_hash`.

Evidência SQL pós-correção:

```json
{
  "INCONSISTENT_ACTIVE": [],
  "ACTIVE_FLOWS": [
    {
      "id": "72043d7c-c1b0-4830-9835-8758fb9aab78",
      "name": "FLOW-RUNTIME-ROOTCAUSE mínimo",
      "status": "active",
      "published_versions": 1,
      "latest_published_at": "2026-07-17T02:33:49.341018+00:00"
    }
  ]
}
```

## Comparação: fluxo que falhava × fluxo funcionando

```json
[
  {
    "name": "Davilys",
    "status": "draft",
    "published_count": 0,
    "max_version": 0,
    "end_nodes": 0,
    "non_end_leafs": [{ "node_type": "ai" }],
    "published_version_id": null
  },
  {
    "name": "FLOW-RUNTIME-ROOTCAUSE mínimo",
    "status": "active",
    "published_count": 1,
    "max_version": 1,
    "end_nodes": 1,
    "non_end_leafs": [],
    "published_version_id": "566202f1-7ef4-4549-9def-1a0abadba027"
  }
]
```

Diferenças exatas:

- `Davilys`: estava `active` com `0` versões publicadas; foi saneado para `draft` porque também não possui nó `end` e tem nó `ai` sem saída.
- Fluxo mínimo: está `active`, possui uma versão `published`, grafo válido `start → message → end` e execução pinada na versão publicada.

## Correção aplicada

1. **Editor desktop:** botão Publicar agora chama `createFlowVersion({ publish: true })`, que cria snapshot em `flow_versions` e promove o fluxo para `active`.
2. **Editor mobile:** botão Publicar agora também cria versão publicada real; o botão Despublicar continua voltando para `draft`.
3. **Inbox:** lista de fluxos ativos agora só mostra fluxos que também possuem pelo menos uma versão `published`, impedindo disparo de estados inconsistentes legados.
4. **Runtime:** instrumentação estruturada adicionada para auditar:
   - `InboxRunFlowRequested`
   - `InboxRunFlowResolved`
   - `CreateRunRequested`
   - `PublishedVersionQueryResult`
   - `PublishedVersionResolved`
   - `RuntimeRunCreated`
   - `RuntimeVersionResolved`
   - `RuntimeGraphResolved`
   - `RuntimeEntryNodeResolved`
   - `RuntimeFirstNode`
5. **Banco:** estado legado `active` sem versão publicada foi saneado para `draft`; criado fluxo mínimo válido e publicado para prova ponta-a-ponta.

## Evidência Playwright

Screenshots geradas:

- `/tmp/browser/flow-runtime-rootcause/screenshots/2_flow_menu.png`
- `/tmp/browser/flow-runtime-rootcause/screenshots/3_flow_dispatched.png`
- `/tmp/browser/flow-runtime-rootcause/screenshots/4_after_execution.png`
- `/tmp/browser/flow-runtime-rootcause/screenshots/7_controlled_repeat.png`

Resultado visível:

- Inbox aberto.
- Fluxo ativo/publicado selecionado.
- Toast: `Fluxo disparado (1 mensagens)`.
- Mensagem criada na conversa: `FLOW-RUNTIME-ROOTCAUSE: execução mínima concluída.`

## Evidência Runtime

Execução controlada repetida 3 vezes, aguardando cada run concluir no banco:

```json
[
  {
    "run_id": "55fedc6b-a413-41c2-be37-85c9c5378c9c",
    "state": "COMPLETED",
    "status": "completed",
    "error": null,
    "messages_sent": 1,
    "version_id": "566202f1-7ef4-4549-9def-1a0abadba027",
    "version_number": 1,
    "steps": 3,
    "path": "start>message>end"
  },
  {
    "run_id": "3804a155-42a5-4687-8397-53805f953bf0",
    "state": "COMPLETED",
    "status": "completed",
    "error": null,
    "messages_sent": 1,
    "version_id": "566202f1-7ef4-4549-9def-1a0abadba027",
    "version_number": 1,
    "steps": 3,
    "path": "start>message>end"
  },
  {
    "run_id": "25c10cd6-c57f-4d83-b34e-93c2597ebf08",
    "state": "COMPLETED",
    "status": "completed",
    "error": null,
    "messages_sent": 1,
    "version_id": "566202f1-7ef4-4549-9def-1a0abadba027",
    "version_number": 1,
    "steps": 3,
    "path": "start>message>end"
  }
]
```

Eventos gravados por run:

```json
[
  "RuntimeRunCreated",
  "RuntimeVersionResolved",
  "RuntimeGraphResolved",
  "RuntimeEntryNodeResolved",
  "FlowResumed",
  "NodeStarted",
  "NodeFinished",
  "NodeStarted",
  "NodeFinished",
  "NodeStarted",
  "NodeFinished",
  "FlowCompleted"
]
```

## Logs de execução

Logs do servidor confirmaram, para cada disparo:

- `InboxRunFlowRequested`
- `InboxRunFlowResolved`
- `CreateRunRequested`
- `PublishedVersionQueryResult found=true`
- `PublishedVersionResolved`
- `RuntimeRunCreated`
- `RuntimeGraphResolved source=published_version`
- `RuntimeEntryNodeResolved`
- `RuntimeFirstNode`

Nenhuma ocorrência nova da mensagem `Fluxo não possui versão publicada` foi observada nos logs durante os disparos validados.

## Arquivos alterados

- `src/routes/_authenticated.flows.$flowId.tsx`
- `src/components/flows/mobile/mobile-flow-detail.tsx`
- `src/lib/inbox.functions.ts`
- `src/lib/flow-executor.server.ts`
- `docs/audits/inbox/FLOW-RUNTIME-ROOTCAUSE-report.md`

## Decisão

**Encerrada.**

Critério atendido: o Inbox executou repetidamente um fluxo ativo com versão publicada real, o Runtime localizou a versão publicada, pinou a execução em `flow_runs`, percorreu `start → message → end`, gravou steps/eventos e finalizou como `COMPLETED` sem erro.