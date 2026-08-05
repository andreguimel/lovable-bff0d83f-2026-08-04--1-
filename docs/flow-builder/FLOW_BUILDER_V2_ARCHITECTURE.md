# FB-01 — Flow Builder V2: Auditoria e Arquitetura Proposta

Missão: **FB-01 — Reconstrução do Flow Builder (Arquitetura + UX)**
Escopo: exclusivamente o **construtor visual** de fluxos. Runtime, banco, APIs, providers, engine e execução permanecem congelados.
Data: 2026-07-17
Autor: Lovable (auditoria read-only + proposta arquitetural, sem alterar código do produto)

---

## 1. Contexto e Regras da Missão

| Regra | Status |
|---|---|
| Não alterar CRM, Inbox, Runtime, Guardian, Banco, APIs, Execução, Engine, fluxos existentes | **Respeitado** — esta entrega é 100% documental |
| Objetivo = melhor UX possível sobre o Runtime atual | **Base do plano** |
| Priorizar usabilidade sobre aparência | **Princípio norteador** |
| Referência (não cópia): BotConversa | **Sim** — inspiração em drag-simple, edição inline, hover-actions, auto-conexão |
| Entregar arquitetura antes de codar | **Este documento** |

**Provas de conceito isoladas são permitidas** (conforme observação do stakeholder) desde que descartáveis, sem tocar Runtime nem quebrar fluxos.

---

## 2. Auditoria — Estado Atual do Flow Builder

### 2.1 Inventário de arquivos

| Arquivo | Linhas | Papel |
|---|---:|---|
| `src/routes/_authenticated.flows.$flowId.tsx` | 618 | **Contêiner monolítico** — carrega grafo, mantém estado de nós/edges, undo/redo, autosave, drag-n-drop, keyboard, publish, test, meta, IA, drawers |
| `src/components/flows/studio/custom-node.tsx` | 163 | **Node genérico** — 17 kinds renderizados por um switch de `preview()` + `isInvalid()` |
| `src/components/flows/studio/properties-panel.tsx` | 353 | **Painel de edição genérico** — todas as configurações de todos os blocos em um único componente |
| `src/components/flows/studio/block-library.tsx` | 227 | Sidebar esquerda de blocos (drag source) |
| `src/components/flows/studio/blocks.ts` | 221 | Catálogo estático: `BLOCKS` (metadata visual) + `CATEGORIES` |
| `src/components/flows/studio/studio-topbar.tsx` | 305 | Topbar (nome, status, save-state, undo/redo, gatilho, publish, test) |
| `src/components/flows/studio/test-drawer.tsx` | 158 | Drawer com passos do Runtime simulado |
| `src/components/flows/studio/analytics-drawer.tsx` | 139 | Drawer de analytics |
| `src/components/flows/studio/copilot-fab.tsx` | 226 | FAB do Copilot IA (`generateFlowWithAI`, `runFlowCopilotAction`) |
| `src/components/flows/mobile/mobile-flow-detail.tsx` | 532 | Detalhe mobile (não é editor completo — redireciona para desktop) |
| `src/lib/flows.functions.ts` | 1421 | **Server** — `getFlowGraph`, `saveFlowGraph`, `createFlowVersion`, `setFlowStatus`, `runFlowTest`, `updateFlowMeta` **(NÃO MEXER)** |
| `src/lib/flow-executor.server.ts` | — | Runtime real **(CONGELADO)** |

### 2.2 Modelo de estado atual

Todo o estado do editor vive em **um único componente** (`FlowStudio`, 618 linhas), via `useState`/`useRef`:

```
FlowStudio (route component)
├── useNodesState<Node<FlowNodeData>>     ← React Flow
├── useEdgesState<Edge>                   ← React Flow
├── selectedId: string | null
├── dirty: boolean
├── saveState: idle|saving|saved|error
├── undoStack: useRef<HistoryEntry[]>     ← snapshots {nodes,edges}
├── redoStack: useRef<HistoryEntry[]>
├── autoSaveTimer: useRef<Timeout>
├── testSteps, testMeta, showAnalytics
├── useQuery(["flow-graph", flowId])      ← fetchGraph
└── 5 useMutation (save, publish, test, meta, status)
```

`FlowNodeData` é um bag genérico (`Record<string,unknown>` estendido) com todos os campos possíveis de todos os blocos misturados:

```ts
interface FlowNodeData {
  __kind: NodeKind; label?; body?; caption?; seconds?; agent_id?;
  tag?; url?; method?; expression?; media_url?; media_filename?;
  media_mime?; media_size?; is_voice?; __selected?; __invalid?; __running?;
}
```

### 2.3 Fluxo de dados

```
Server (getFlowGraph)
   │
   ▼
useQuery → useEffect(load) → setNodes/setEdges (React Flow local state)
   │                                                     │
   │                                                     ▼
   │                              onNodesChange/onEdgesChange/onConnect
   │                                                     │
   │                              pushHistory() (snapshot) + setDirty(true)
   │                                                     │
   │                              debounce 800ms → saveMutation
   │                                                     │
   ▼                                                     ▼
sessionStorage `flow-draft:${flowId}` ←──── buildSavePayload() ──── saveFlowGraph
```

- Autosave: 800 ms de debounce após qualquer `dirty`.
- Rascunho: `sessionStorage[flow-draft:<id>]` a cada mudança (nunca é lido de volta — apenas escrito).
- Undo: pilha em `useRef` de snapshots completos (`{nodes, edges}` cheios), limite 50.
- Publish: força save + `createFlowVersion({ publish: true })`.

### 2.4 Renderização do node

Um único `FlowNode` cobre 17 kinds via:
- `BLOCKS[kind]` → ícone, cor, nº handles
- `preview(kind, data)` → texto secundário (switch de 17 cases)
- `isInvalid(kind, data)` → validação (switch de 17 cases)

Handles são hard-coded: condition = 2 handles verticais (60% e 85%), demais = 1, `end` = 0.

### 2.5 Edição

`PropertiesPanel` (353 linhas) é um único componente com blocos `if (kind === "message")`, `if (mediaKind)`, `if (kind === "condition")`, etc. Toda vez que um bloco muda um campo, `updateSelected({...})` faz merge parcial em `FlowNodeData`.

---

## 3. Análise Crítica

### 3.1 O que funciona bem

- ✅ **Runtime canônico** — o editor não fala com o executor, apenas persiste o grafo. Isolamento correto.
- ✅ **Autosave + rascunho de sessão** — usuário raramente perde trabalho.
- ✅ **Undo/redo** com atalhos padrão.
- ✅ **Drag-and-drop** da library para o canvas funciona (via `screenToFlowPosition`).
- ✅ **Copilot IA** gera fluxos completos (`generateFlowWithAI`) e patches.
- ✅ **Teste** (`runFlowTest`) reutiliza o Runtime real (paridade validada em RUNTIME-PARITY).
- ✅ **Validação de bloqueio de publicação** (grafo órfão) já vive no server.

### 3.2 O que não funciona / é frágil

| # | Problema | Impacto |
|---|---|---|
| P1 | **Monólito de 618 linhas** concentra route, estado, side-effects, atalhos, IA, DnD, teste, meta, publish | Difícil de testar, difícil de estender, cada bloco novo cresce este arquivo |
| P2 | **`FlowNodeData` é bag genérico** — todos os campos de todos os blocos convivem em uma única interface | Sem type-safety por bloco; refactor risky; validação espalhada |
| P3 | **`custom-node.tsx` acopla 17 kinds** via switch — impossível evoluir um bloco sem tocar todos | Alto risco de regressão |
| P4 | **`properties-panel.tsx` acopla 17 formulários** em um só componente | Idem |
| P5 | **Sem store dedicada** (Zustand/Jotai) — cada mudança de campo re-renderiza todo o Studio (618 linhas de props/hooks) | Perceptível > 50 nós |
| P6 | **Undo/redo por snapshot completo** de `{nodes, edges}` — cada `pushHistory` copia arrays inteiros | O(n) em memória por ação; 50 snapshots × 200 nós ≈ MB |
| P7 | **`historyTick` state** só para forçar re-render de `canUndo/canRedo` — code smell | Bugs sutis (a expressão `undoStack.current.length > 0 && historyTick >= 0` é sempre true) |
| P8 | **`sessionStorage` só escreve, nunca lê** — funcionalidade morta | Confunde manutenção |
| P9 | **Deps de `useEffect` autosave** com `// eslint-disable` — indica modelo de dados incorreto | Autosave pode disparar em situações não intencionais |
| P10 | **Handles de condition fixos em `top: 60%` e `85%`** — não escala se um dia condition tiver 3+ saídas | Rígido |
| P11 | **Sem seleção múltipla** (marquee, shift-click, mover em grupo, deletar em grupo) | Fricção alta em fluxos > 20 nós |
| P12 | **Sem copy/paste** entre nós/subgrafos, mesmo dentro do mesmo fluxo | Duplicar bloco é útil, colar subárvore é essencial |
| P13 | **Sem auto-conexão** ao arrastar bloco perto de um handle — cada aresta exige drag preciso | BotConversa faz isso melhor |
| P14 | **Painel de propriedades desaparece ao clicar no canvas** (`onPaneClick`) — perde contexto | Frustrante ao editar |
| P15 | **Rascunho local não recupera** — se o server-save falhar e o usuário fechar, perde. | Já existe o dado, falta o read-back |
| P16 | **Validação só sinaliza no node, não impede publicação inválida** no cliente | Só descobre o erro depois de clicar publicar |
| P17 | **Zoom / pan / drag no canvas com 100+ nós**: sem virtualização (`onlyRenderVisibleElements` do React Flow desativado por default) | Degradação previsível |
| P18 | **Mobile é read-only** — mobile-flow-detail redireciona para desktop | Aceitável para v1, mas precisa estar claro |
| P19 | **Toda mudança de campo do PropertiesPanel** dispara `setNodes(map)` — clona array inteiro e re-anima edges | Digitação lenta em fluxos grandes |
| P20 | **Nenhum teste** unitário/E2E cobre o Studio hoje (buscando: só executor tem testes) | Reconstrução sem rede de segurança |

### 3.3 O que é confuso

- Dois blocos `wait` e `wait_reply` — usuário não sabe qual usar quando.
- Bloco `question` envia mas não pausa (RT-M-06 conhecido no backlog); autor precisa colocar `wait_reply` depois.
- `assign_agent` reusa `transferNode` no runtime e descarta `agent_id` (RT-M-07). No editor, ambos parecem funcionar igual.
- `transfer` vs `assign_agent` — a diferença semântica não fica clara na UI.
- `webhook` vs `http_request` — nomes quase idênticos, comportamentos parecidos.

### 3.4 O que pode ser simplificado

- Colapsar `wait_reply` como *modo* do `question`.
- Colapsar `webhook` como preset de `http_request`.
- Mostrar apenas 4 categorias no menu inicial (Mensagem, Lógica, IA, Ações) e esconder integrações atrás de "+ Mais".

### 3.5 O que deve ser removido

- `sessionStorage`-só-escrita (P8).
- `historyTick` como state (P7).
- `MiniMap` no default (poluição visual em fluxos pequenos — mover para toggle).

### 3.6 O que precisa ser reconstruído

- Modelo de estado (extrair para store).
- Renderização por bloco (um componente por kind).
- Edição por bloco (um form por kind, com schema/validador próprio).
- Undo/redo baseado em **patch/diff** (não snapshot).

---

## 4. Nova Arquitetura Proposta — Flow Builder V2

### 4.1 Princípios

1. **Um bloco = um módulo autocontido.** Nada de switches genéricos.
2. **Canvas é o protagonista.** Toolbars finas, painel lateral único, zero modais.
3. **Estado centralizado, seletores atômicos.** Cada bloco lê só o que precisa.
4. **Contrato do Runtime é sagrado.** Serializer traduz o modelo V2 para o formato aceito por `saveFlowGraph` — Runtime não muda.
5. **Zero refactor de banco.** Mesma tabela `flow_versions`, mesmo shape de `nodes/edges`.

### 4.2 Camadas

```
┌──────────────────────────────────────────────────────────────┐
│  ROUTE (thin)  src/routes/_authenticated.flows.$flowId.tsx  │
│  — só provider + <FlowStudio flowId=…/>                     │
└─────────────────────┬────────────────────────────────────────┘
                      ▼
┌──────────────────────────────────────────────────────────────┐
│  SHELL           src/features/flow-builder/shell/            │
│  StudioShell · Topbar · Sidebar · Canvas · Inspector · Fabs │
└─────────────────────┬────────────────────────────────────────┘
                      ▼
┌──────────────────────────────────────────────────────────────┐
│  STATE (Zustand)  src/features/flow-builder/state/           │
│  useBuilderStore  ── nodes/edges/selection/history/dirty     │
│  selectors atômicos (useNode(id), useSelectedNode, …)        │
└─────────────────────┬────────────────────────────────────────┘
                      ▼
┌──────────────────────────────────────────────────────────────┐
│  BLOCK REGISTRY   src/features/flow-builder/blocks/          │
│  registry.ts  → BlockDefinition[]                            │
│  <kind>/                                                     │
│    index.ts        → registra o bloco                       │
│    schema.ts       → zod schema dos dados                   │
│    Node.tsx        → renderização no canvas                  │
│    Inspector.tsx   → form de edição                          │
│    preview.ts      → string curta para o card                │
│    validate.ts     → regras (bloqueia publish)               │
│    icon.ts         → ícone + accent color                    │
│    meta.ts         → label, categoria, handles, defaults     │
└─────────────────────┬────────────────────────────────────────┘
                      ▼
┌──────────────────────────────────────────────────────────────┐
│  SERIALIZER  src/features/flow-builder/io/                   │
│  toServer(model) / fromServer(dto) — contrato com Runtime    │
│  Nenhum outro lugar toca o shape do banco.                   │
└─────────────────────┬────────────────────────────────────────┘
                      ▼
┌──────────────────────────────────────────────────────────────┐
│  API                (INTOCÁVEL)                              │
│  src/lib/flows.functions.ts  ← mesma versão                  │
└──────────────────────────────────────────────────────────────┘
```

### 4.3 `BlockDefinition` — contrato canônico por bloco

```ts
// src/features/flow-builder/blocks/types.ts
export interface BlockDefinition<TData extends BlockDataBase = BlockDataBase> {
  kind: NodeKind;                 // mesma string do banco
  meta: {
    label: string;
    category: BlockCategory;
    icon: LucideIcon;
    accent: string;
    handles: { in: 0|1; out: HandleSpec[] };  // dinâmico
    defaults: TData;
  };
  schema: z.ZodType<TData>;                    // validação estrutural
  validate: (data: TData) => ValidationResult; // regras de negócio de UI
  preview: (data: TData) => string | null;     // texto no card
  Node: React.FC<NodeProps<TData>>;            // renderização
  Inspector: React.FC<InspectorProps<TData>>;  // form de edição
}
```

Registro:

```ts
// src/features/flow-builder/blocks/registry.ts
import message from "./message";
import question from "./question";
// …
export const registry: Record<NodeKind, BlockDefinition> = {
  message, question, condition, ai, transfer, /* … */
};
```

Consequência: `custom-node.tsx` e `properties-panel.tsx` **desaparecem**. O canvas monta `registry[kind].Node` e o inspector monta `registry[selected.kind].Inspector`.

### 4.4 Store (Zustand + immer)

```ts
interface BuilderState {
  flowId: string;
  nodes: Record<string, BuilderNode>;  // por id, não array — O(1) lookup
  edges: Record<string, BuilderEdge>;
  order: string[];                     // z-order/render order

  selection: { nodeIds: string[]; edgeIds: string[] };

  history: { past: Patch[]; future: Patch[]; };  // patches, não snapshots
  dirty: boolean;
  saveState: SaveState;

  // ações — todas geram Patch
  addNode(kind, position): void;
  updateNodeData(id, patch): void;
  removeSelection(): void;
  connect(edge): void;
  applyAiPatch(patch): void;
  loadFromServer(dto): void;
}
```

Seletores atômicos (`useNode(id)`, `useIsSelected(id)`) evitam re-render em cascata (P5/P19).

Undo/redo por **patch** (immer `produce` retorna patches inversos) — memória O(delta) (resolve P6).

### 4.5 Fluxo de dados V2

```
Server (getFlowGraph)  ──►  fromServer()  ──►  store.loadFromServer()
                                                       │
                                                       ▼
                                       Node.tsx (per-kind) via seletor atômico
                                                       │
                                     onChange → store.updateNodeData(id, patch)
                                                       │
                                     patch → history.past.push(inverse)
                                                       │
                          store.dirty=true → autosave debounce 800ms
                                                       │
                                       toServer(model) → saveFlowGraph  (mesma API)
```

### 4.6 UX — decisões concretas

| Decisão | Motivo |
|---|---|
| **Painel de edição sempre visível** quando há seleção; ESC deseleciona | Fim do P14 |
| **Auto-conexão** ao soltar bloco < 80px de um handle livre | Reduz cliques |
| **Ghost-drop** — arrastar bloco da sidebar mostra preview no canvas | Feedback imediato |
| **Seleção múltipla** (marquee + shift) + delete/duplicate/mover em grupo | P11 |
| **Copy/paste** de subgrafo (JSON no clipboard, prefixo `zenda-flow/`) | P12 |
| **Validação em tempo real** com contador na topbar ("2 blocos com erro") + botão "Ir para o próximo erro" | P16 |
| **MiniMap opcional** (toggle na topbar, off por padrão) | Menos poluição |
| **Command palette** (`⌘K`): adicionar bloco por nome, saltar para bloco, publicar, testar | Fluxo teclado-first |
| **Trilha de execução** overlay no teste — cada bloco pulsa em ordem | Debug visível |
| **Sem modais** — configurações no inspector; confirmações em popover inline | Uma superfície só |

### 4.7 Performance

- `nodes` como `Record<id, Node>` + `useNode(id)` seletor: cada nó só re-renderiza quando seus próprios dados mudam (P5/P19).
- `React.memo` em cada `Node` de bloco com equality shallow do seu slice.
- React Flow: ativar `onlyRenderVisibleElements` acima de 60 nós (P17).
- Edges: mover animação para CSS puro (`stroke-dasharray`), não JS.
- Autosave: descolar o debounce da árvore de renderização (subscribe direto na store, fora do React).
- Undo por patch: memória O(delta) (P6).
- Fitview inicial: uma única chamada após `loadFromServer`, sem `setTimeout` mágico.

**Meta operacional:** manter 60 fps com **300 nós** e **500 edges**, drag/zoom/pan sem jank.

### 4.8 Compatibilidade

- Serializer `toServer`/`fromServer` produz **exatamente** o shape aceito por `saveFlowGraph` e devolvido por `getFlowGraph` hoje. Zero mudança de contrato.
- Cada `BlockDefinition.schema` é `z.parse` do payload atual → migração sem lossy transform.
- Fluxos existentes carregam idêntico, salvam idêntico, executam idêntico.
- `runFlowTest` e `createFlowVersion` continuam sendo chamados com o mesmo payload.
- Feature flag `flow-builder-v2` gate a nova rota; V1 fica disponível como fallback durante o rollout.

### 4.9 Riscos

| Risco | Mitigação |
|---|---|
| Regressão silenciosa na serialização | Test suite de round-trip: `toServer(fromServer(fixture)) === fixture` para 20 fluxos reais |
| Undo por patch complexo | Usar `immer.produceWithPatches` (bem testado) |
| Divergência V1↔V2 durante rollout | Feature flag por org; toggle no header apenas para admins |
| Copilot IA quebrar (usa `applyAIPatch`) | Manter mesma assinatura de patch; adapter no V2 |
| Bugs em blocos raros (`webhook`, `http_request`) | Preservar os componentes V1 como fallback até V2 atingir 100% dos kinds |
| Mobile | Fora do escopo desta missão; mantém redirect atual |

### 4.10 O que fica fora desta missão

- Novos tipos de bloco (MenuNode, RandomNode, GPTNode, IntegrationNode, FlowConnectionNode citados no briefing) — **backlog pós V2 base**. V2 primeiro **paridade** com os 17 kinds atuais, depois novos.
- Colaboração multi-cursor.
- Versionamento visual/diff entre versões publicadas.
- Editor mobile.
- Mudanças no Runtime, no schema `flow_versions`, no scheduler.

---

## 5. Plano de Implementação (missões independentes)

Cada missão termina com: **código funcionando + testes + relatório + aprovação**. Nada começa sem "verde" da anterior.

### FB-02 · Fundação (esqueleto sem trocar UX)
- Criar `src/features/flow-builder/` (shell, state, blocks, io).
- Implementar store Zustand vazia + seletores.
- Implementar `serializer` (round-trip test com 5 fluxos de fixture).
- Feature flag `flow-builder-v2` (off por padrão).
- Sem mudança visível para o usuário.
- **Duração estimada:** 1 dia.

### FB-03 · Block Registry + primeiros 4 blocos
- Migrar `start`, `message`, `end`, `wait` para o novo contrato.
- V2 renderiza esses 4; demais caem em fallback V1 (adapter).
- **Aceite:** carregar/salvar/executar fluxo mínimo idêntico ao V1.
- **Duração:** 1 dia.

### FB-04 · Migração dos 17 kinds
- Portar cada bloco restante, um por vez, com teste de snapshot do inspector.
- **Aceite:** paridade funcional 100% com V1 em fluxos reais da WebMarcas.
- **Duração:** 2–3 dias.

### FB-05 · UX Core (canvas + inspector)
- Painel sempre visível; ESC deseleciona.
- Seleção múltipla + delete/duplicate em grupo.
- Copy/paste de subgrafo.
- Auto-conexão a handle próximo.
- **Duração:** 1–2 dias.

### FB-06 · Undo por patch + performance
- Trocar snapshots por patches (`produceWithPatches`).
- Ativar `onlyRenderVisibleElements` > 60 nós.
- Benchmark: 300 nós / 500 edges / 60 fps.
- **Duração:** 1 dia.

### FB-07 · Command palette + validação inline + trilha de teste
- `⌘K` para tudo; contador de erros na topbar; overlay de execução no teste.
- **Duração:** 1 dia.

### FB-08 · Cleanup + rollout
- Remover código V1 do Studio (mantém apenas rota).
- Remover feature flag após 1 semana estável em piloto.
- Documentação final `docs/flow-builder/README.md`.
- **Duração:** 0.5 dia.

**Total estimado:** ~8–10 dias úteis, sequencial. Nenhuma missão excede 2 dias.

---

## 6. Provas de Conceito Permitidas (conforme observação do stakeholder)

Somente estas POCs podem ser executadas **antes** de FB-02, isoladamente, sem entrar em produção:

1. **POC Store** — Zustand + immer com 300 nós fake, medir re-render por seletor.
2. **POC Undo por patch** — validar que `produceWithPatches` reverte um subgrafo complexo.
3. **POC Serializer round-trip** — carregar 5 fluxos reais da WebMarcas, aplicar `toServer(fromServer(x))`, diff = ∅.

Cada POC vive em `/tmp` ou branch descartável, não altera Runtime nem `flows.functions.ts`, e é descartada após decisão.

---

## 7. Decisão pendente do stakeholder

Antes de FB-02 iniciar, confirmar:

1. **Aprovado o escopo desta arquitetura?**
2. **Rodar as 3 POCs primeiro** ou ir direto para FB-02?
3. **Feature flag** por organização (ativa só na WebMarcas primeiro) ou global?

Nenhuma linha de código do Flow Builder foi modificada nesta missão.
