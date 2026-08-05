# Flow Builder V2 — Núcleo (FB-02)

Módulo isolado. Não é usado ainda em produção — a rota atual continua
com o V1. Este README descreve como as próximas missões (FB-03+)
consomem o núcleo criado nesta missão.

## Camadas

```
src/features/flow-builder/
  blocks/       # Registry + contrato BlockDefinition
  state/        # Store Zustand + seletores atômicos
  io/           # Serializer toServer/fromServer (contrato com Runtime)
  events/       # Event Bus interno (único pub/sub do módulo)
  history/      # Undo/Redo por patches (immer) — pronto, off por padrão
  validation/   # validateNode / validateGraph (por bloco, sob demanda)
  panel/        # Host único do painel lateral (Inspector resolvido pelo Registry)
  flags.ts      # FLOW_BUILDER_V2_ENABLED (OFF)
  index.ts      # Barrel público (única fonte de import)
```

## API pública

Sempre importar de `@/features/flow-builder`.

```ts
import {
  blockRegistry,
  useBuilderStore,
  useSelectedNode,
  fromServer,
  toServer,
  builderBus,
  validateGraph,
  useInspectorHost,
} from "@/features/flow-builder";
```

## Registrar um bloco (FB-03 em diante)

```ts
import { blockRegistry } from "@/features/flow-builder";
import { MessageIcon } from "lucide-react";

blockRegistry.register({
  kind: "message",
  meta: {
    label: "Enviar mensagem",
    short: "Texto simples",
    category: "channels",
    icon: MessageIcon,
    accent: "oklch(0.72 0.16 160)",
    handles: { in: 1, out: [{ id: "default" }] },
    defaults: { body: "" },
  },
  preview: (d) => (d.body ? d.body.slice(0, 80) : null),
  validate: (d) => ({
    valid: !!d.body,
    issues: d.body ? [] : [{ severity: "error", message: "Conteúdo obrigatório" }],
  }),
  Node: MessageNode,
  Inspector: MessageInspector,
});
```

## Regras de ouro

- Nenhum switch por `kind` fora do Registry.
- Nenhum estado paralelo do grafo — a store é a única verdade.
- Nenhum Drawer/Modal/Popup para edição de bloco — só o painel único.
- Nenhum acesso direto ao shape do banco — só via serializer.
- Nenhum pub/sub próprio — só o `builderBus`.
- Runtime, Banco, APIs e fluxos existentes permanecem intocáveis.
