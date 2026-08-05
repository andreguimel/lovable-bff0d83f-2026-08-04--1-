# FB-02 — Reconstrução do Flow Builder (Núcleo)

**Missão:** FB-02 — Núcleo do Flow Builder V2
**Escopo:** Fundação sem alterar comportamento dos blocos
**Data:** 2026-07-17
**Arquitetura de referência:** `docs/flow-builder/FLOW_BUILDER_V2_ARCHITECTURE.md`
**Status:** Encerrada — código funcionando, testes verdes, V1 intocado.

---

## 1. Entregável

Módulo novo, isolado, sob `src/features/flow-builder/`. Nenhum arquivo do
V1 foi alterado — a rota `_authenticated.flows.$flowId.tsx` continua
renderizando o `FlowStudio` V1. O núcleo V2 nasce OFF (`FLOW_BUILDER_V2_ENABLED = false`).

```
src/features/flow-builder/
├── index.ts                 # Barrel público (única fonte de import)
├── flags.ts                 # Feature flag (OFF)
├── README.md                # Guia de uso para FB-03+
├── blocks/
│   ├── types.ts             # Contrato BlockDefinition (schema, validate, Node, Inspector, …)
│   └── registry.ts          # Registry central — único ponto de registro
├── state/
│   ├── types.ts             # BuilderNode / BuilderEdge / SaveState
│   ├── store.ts             # Store Zustand + immer (headless)
│   └── selectors.ts         # useNode, useSelectedNode, useDirty, …
├── io/
│   └── serializer.ts        # fromServer / toServer — contrato com Runtime
├── events/
│   └── bus.ts               # Event Bus interno tipado (único pub/sub)
├── history/
│   └── patches.ts           # withHistory + HistoryStack (immer patches)
├── validation/
│   └── index.ts             # validateNode / validateGraph (sob demanda)
├── panel/
│   └── host.tsx             # useInspectorHost — painel lateral único
└── __tests__/
    ├── serializer.test.ts   # Round-trip toServer(fromServer(x)) === x
    ├── store.test.ts        # load / mutar / conectar / selecionar
    └── bus.test.ts          # tipagem e escopo dos eventos
```

## 2. Checklist da missão

| # | Item | Onde | Status |
|---|---|---|---|
| 1 | Registry de Nodes (único ponto) | `blocks/registry.ts` | Feito |
| 2 | Definição única de Node (id, meta, schema, validator, preview, Node, Inspector, serializer) | `blocks/types.ts` | Feito |
| 3 | Nova store centralizada, sem estado paralelo | `state/store.ts` | Feito |
| 4 | Sistema único de seleção (impossível ter 2 nós ativos) | `store.selectNode` + seletores | Feito |
| 5 | Sistema único de painel lateral | `panel/host.tsx` | Feito |
| 6 | Event Bus interno (selecionar, mover, duplicar, apagar, conectar, editar, salvar, cancelar) | `events/bus.ts` | Feito |
| 7 | Serializer universal (compat V1 ↔ Runtime) | `io/serializer.ts` + round-trip test | Feito |
| 8 | Validação por bloco (nunca revalida grafo inteiro na edição) | `validation/index.ts` | Feito |
| 9 | Undo/Redo preparado (immer patches) | `history/patches.ts` | Preparado (OFF em produção) |
| 10 | Preparado para MiniMap / Comentários / Agrupamentos / Analytics / Debug / Versionamento | Event Bus + seletores atômicos + snapshot serializable | Preparado |

## 3. Regra de ouro do núcleo

- Nenhum switch por `kind` fora do Registry.
- Nenhum estado paralelo do grafo — a store é a única verdade.
- Nenhum Drawer/Modal/Popup para edição — só o painel único.
- Nenhum acesso direto ao shape do banco — só via serializer.
- Nenhum pub/sub próprio — só o `builderBus`.

## 4. Compatibilidade com o Runtime (crítico)

- `toServer` / `fromServer` produzem exatamente o shape aceito por
  `saveFlowGraph` e devolvido por `getFlowGraph` hoje.
- Kinds ainda não migrados para o Registry passam pelo serializer **sem
  perda** — o objeto `data` viaja intacto. Isso garante que qualquer
  fluxo existente pode abrir e salvar no V2 sem alterar o banco.
- Teste automatizado (`serializer.test.ts`) prova o round-trip em 3
  cenários: fluxo completo (start / message / condition / end),
  posição ausente e kind desconhecido.

## 5. Testes executados

```
bun test src/features/flow-builder
 13 pass · 0 fail · 55 expect() calls · 50 ms
```

Cobrem exatamente os cenários exigidos pela missão:

- abrir fluxo existente (`loadFromSnapshot`)
- salvar fluxo existente (`toSnapshot` → `toServer`)
- mover nó
- criar conexão
- excluir conexão
- selecionar / trocar / limpar seleção (garante seleção única)
- update parcial de dados de nó
- round-trip do serializer preservando bytes
- event bus tipado com escopo correto

Typecheck: `tsgo --noEmit` → 0 erros no módulo novo.
V1 (`FlowStudio`, `custom-node`, `properties-panel`, `blocks.ts`,
`block-library`) **não foi tocado** — build e comportamento anteriores
preservados.

## 6. O que NÃO foi feito (por design da missão)

- Reconstruir os 17 blocos legados (isso é FB-03/FB-04).
- Plugar o V2 na rota (isso é FB-03).
- Ativar Undo/Redo (isso é FB-06 — a infra já está pronta).
- Alterar UX, cores, Design System, aparência.
- Tocar em Runtime, Executor, Banco, APIs, Guardian, Inbox, CRM.

## 7. Próximo passo sugerido

**FB-03 — Block Registry + primeiros 4 blocos** (start, message, end, wait):

1. Criar `blocks/message/` implementando `BlockDefinition` completa.
2. Repetir para `start`, `end`, `wait`.
3. Feature flag ON em rota de teste (`/flows/$flowId?builder=v2`).
4. Round-trip validado num fluxo real.

Nenhum bloco novo é criado — apenas migração de paridade.

## 8. Decisão

**Encerrada.** Infra pronta, testes verdes, V1 preservado, Runtime
intocado. Aguardar autorização explícita antes de iniciar FB-03.
