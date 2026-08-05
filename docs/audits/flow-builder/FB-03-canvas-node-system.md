# FB-03 — Canvas V2 + Node System V2

**Missão:** Reconstruir o Canvas e o sistema de Nodes sobre a fundação
FB-02, mantendo Runtime, banco e fluxos existentes intactos.
**Status:** ✅ Concluída — software em produção interno, V1 preservado como fallback.

---

## 1. Escopo entregue

| # | Item | Entrega |
|---|------|---------|
| 1 | Novo Canvas | `src/features/flow-builder/canvas/FlowCanvasV2.tsx` |
| 2 | Node universal | `src/features/flow-builder/canvas/BlockNode.tsx` |
| 3 | Card padrão V2 | `src/features/flow-builder/canvas/BlockCard.tsx` |
| 4 | Estilo de aresta canônico | `src/features/flow-builder/canvas/edges.ts` |
| 5 | CSS isolado `fbv2-*` | `src/features/flow-builder/canvas/canvas.css` |
| 6 | Registry dos 17 kinds legados | `src/features/flow-builder/blocks/definitions.ts` |
| 7 | Shell V2 (IO + wiring) | `src/features/flow-builder/FlowStudioV2.tsx` |
| 8 | Rota condicional por flag | `src/routes/_authenticated.flows.$flowId.tsx` |
| 9 | Flag `FLOW_BUILDER_V2_ENABLED = true` | `src/features/flow-builder/flags.ts` |

---

## 2. Arquitetura

```
route (/flows/:id)
      │  (flag)
      └──► FlowStudioV2 (shell)
              │
              ├── StudioTopbar (V1 reutilizado, wiring novo)
              ├── BlockLibrary (V1 reutilizada, chama store.addNode)
              ├── FlowCanvasV2 ──► ReactFlow
              │     └── NodeType "fbv2" ──► BlockNode ──► BlockCard
              │                                    │
              │                          Registry (definitions.ts)
              └── PropertiesPanel (V1 reutilizado — data = store.selected)
```

### Fonte única de verdade

O Canvas V2 **não mantém estado paralelo** de nodes/edges. Todo render é
projetado da store Zustand (`useBuilderStore`) via `useNodeIds` /
`useEdgeIds` + `getState()` para as coleções. Eventos do React Flow
traduzem-se em mutações da store:

| Evento React Flow          | Ação na store               |
|----------------------------|-----------------------------|
| `onNodesChange`(position)  | `moveNode`                  |
| `onNodesChange`(remove)    | `removeNode` (bloqueia `start`) |
| `onEdgesChange`(remove)    | `disconnect`                |
| `onConnect`                | `connect`                   |
| `onSelectionChange`        | `selectNode` / `selectMany` |
| `onPaneClick`              | `clearSelection`            |
| Drop de `application/x-flow-block` | `addNode` no ponto do cursor |

Nada de `useNodesState`/`useEdgesState`. Nenhum `useState` para nodes
ou edges. Elimina definitivamente o padrão do V1 onde o Studio inteiro
re-renderizava a cada digitação (P5/P19 do audit).

### Node universal + Registry

Um único `NodeType` é registrado no React Flow (`{ fbv2: BlockNode }`).
O `BlockNode` resolve o bloco pelo Registry (`blockRegistry.get(kind)`)
e monta o card. Todo `switch (kind)` foi eliminado do render — o meta
do bloco descreve **ícone, cor accent, handles (in + saídas) e defaults**;
o resto (`preview`, `validate`) é opcional no `BlockDefinition`.

Kinds ainda desconhecidos caem em um estado degradado seguro
(`fbv2-node--unknown`) — nenhum fluxo antigo quebra por depender de um
kind removido.

### Card padrão V2

Layout fixo aplicado a todos os 17 blocos:

- **Header:** ícone (chip com accent) + título (editável no data) + rótulo do kind
- **Body:** `preview(data)` (2 linhas, ellipsis) — omitido se null
- **Flag de aviso:** exibida no header quando `validate()` reprova ou `__invalid`
- **Portas:** 0..1 in à esquerda; 0..N out à direita, distribuídas
  automaticamente em porcentagem (1/(N+1), 2/(N+1)…), com labels
  opcionais (`sim`/`não` no `condition`)
- **Rodapé:** slot opcional (não usado por padrão em FB-03)

### Portas V2

- `.fbv2-handle` — 14×14 visível, **área de clique 30×30 via `::after`**
- Hover: escala 1.35 + halo de 6px com accent
- Estados nativos do React Flow (`.connectingfrom`, `.connectingto`)
  usam accent para feedback imediato
- Cores dedicadas: verde (`--yes`), vermelho (`--no`), accent do bloco (default)

### Edges

`edges.ts::styleEdge` retorna sempre `type: smoothstep`, com
`markerEnd` de seta preenchida na mesma cor. Selecionar aumenta stroke
para 2.25px e opacidade para 90%. Preview durante drag é `dasharray`
em primary.

### Serialização e compatibilidade

Nenhuma migração de banco. Carga:

```ts
snapshot = fromServer(dbGraph);
if (!snapshot.nodes.some(n => n.kind === "start"))
  snapshot.nodes.unshift(defaultStart);       // paridade V1
store.loadFromSnapshot(flowId, snapshot);
```

Salvamento:

```ts
payload = toServer(store.toSnapshot());
saveGraphFn({ data: { flowId, ...payload } });
```

Como o Registry declara os mesmos 17 `kind`s aceitos pelo Zod do
`saveFlowGraph`, o cast final é seguro (validado pelo schema server-side).

### Runtime

Nada tocado: `flow-executor.*`, `flow-resume-*`, `flow-studio.functions`
permanecem intactos. O payload gravado é bit-para-bit compatível com o
que o V1 grava hoje (verificado pelo teste `salvar fluxo existente:
round-trip via toServer preserva DTO`).

### Preparação (arquitetura pronta, não ligada)

- **Multi-seleção:** store já expõe `selectMany`, e o Canvas passa
  `multiSelectionKeyCode={["Meta","Control","Shift"]}` + `selectionOnDrag`.
- **Snap/Grid:** `snapToGrid` + `snapGrid=[16,16]` já configurados.
- **MiniMap / Comentários / Analytics:** consomem o Event Bus criado
  em FB-02 (`builderBus`) — nenhuma mudança necessária aqui.
- **Undo/Redo:** já disponível via `store.undo()/redo()`, ligado ao
  Topbar. Habilitação plena em FB-06 (mission oficial).

---

## 3. Compatibilidade

- Feature flag `FLOW_BUILDER_V2_ENABLED` em `src/features/flow-builder/flags.ts`.
  Rollback = trocar para `false` (V1 volta imediatamente, código intocado
  em `src/components/flows/studio/*` e no route).
- Fluxos existentes carregam sem migração: validado abrindo o fluxo
  `Davilys (cópia)` — 11 nodes reais renderizados no primeiro paint.
- Nenhum kind precisou de novo campo em `flow_nodes.data`.
- Runtime não recebeu nenhuma alteração.

---

## 4. Testes

### Automatizados (`bun test src/features/flow-builder`)

```
13 pass / 0 fail / 55 expect() calls
```

Cobrem serializer round-trip, store (add/move/connect/remove/select),
event bus, e persistência (payload equivalente ao V1).

### Typecheck

`bunx tsgo --noEmit` — 0 erros.

### E2E manual via Playwright headless

Roteiro executado em `/tmp/browser/fb03/run.py`:

1. Login com sessão Supabase injetada
2. Navega para `/flows` → escolhe primeiro fluxo real
3. Abre `/flows/:id`
4. Verifica DOM final

Resultado:

```
INFO {'nodes': 11, 'handles': 20, 'canvas': True, 'shell': True, 'v1Nodes': 0}
```

Screenshot `shots/2_builder.png` mostra:
- Todos os 11 nodes renderizados com o novo BlockCard
- Header (ícone accent + título + kind), preview body, portas
- Cores distintas por categoria
- Curvas suaves com marker de seta
- MiniMap + Controls presentes
- BlockLibrary intacta
- **Zero `.flow-node` (V1)** — o V2 substituiu integralmente o render

---

## 5. Performance

- Render por seletores atômicos: mover 1 node não recomputa `edges` nem
  `nodes` inteiros — apenas o item afetado.
- `BlockNode` memoizado; `preview`/`invalid` calculados via `useMemo` no
  próprio node.
- `elevateNodesOnSelect` para z-index consistente sem re-render global.
- `will-change: transform` no `.fbv2-node` (aciona GPU).
- Sem `fitView` a cada render — apenas na carga inicial.

Validação empírica pendente (target FB-06): >100 nodes com pan/zoom
mantendo 60fps. Fluxos reais do piloto (<50 nodes) ficam
imperceptivelmente fluidos.

---

## 6. Restrições respeitadas

- ❌ Runtime, Executor, Banco, APIs, Guardian, Inbox, CRM: **não tocados**.
- ❌ Novos documentos de arquitetura: **não criados**. A referência única
  segue `docs/flow-builder/FLOW_BUILDER_V2_ARCHITECTURE.md`.
- ❌ Aparência global / Design System: **não alterada** (fbv2 tokens
  derivam das mesmas variáveis `--color-*` do app).
- ❌ Reconstrução de blocos individuais: adiada para FB-04.

---

## 7. Próxima missão

FB-04 — **Blocks Migration**: mover cada bloco para seu próprio módulo
(`schema` Zod, `Inspector`, `validate` avançado, `preview` rico),
substituindo o `PropertiesPanel` monolítico atual por Inspectors
resolvidos pelo Registry (`useInspectorHost` já pronto).

**Decisão:** Encerrada. Aguardando autorização para FB-04.
