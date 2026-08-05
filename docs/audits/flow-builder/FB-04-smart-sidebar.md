# FB-04 — SmartSidebar (painel único de configuração)

**Status:** ✅ Encerrada
**Data:** 2026-07-17
**Missão:** FB-04 · Reconstrução do Flow Builder — Smart Sidebar V2
**Escopo:** exclusivamente a experiência de configuração dos blocos.

> **Não alterado (proibições respeitadas):** Runtime, Banco, Executor, Engine, Fluxos existentes, Canvas, Sistema de Nodes, Registry (contrato apenas *estendido*, não modificado).

---

## 1. Objetivo

Substituir o `PropertiesPanel` legado (switch gigante com 17 branches, mídias e regras inline) por um **SmartSidebar único e declarativo**, cumprindo a filosofia:

> "O usuário nunca deve procurar uma configuração. Ela deve estar onde ele espera."

## 2. O que foi entregue

### 2.1 Biblioteca universal de campos
`src/features/flow-builder/fields/`
- `types.ts` — contrato `FieldSpec` (text, textarea, number, select, switch, media, info) + `SidebarCtx` (agentes, canais, flowId).
- `renderer.tsx` — dispatcher único (`FieldRenderer`). Nenhum bloco importa `Input`/`Select`/`Textarea`/`Switch`/`MediaPicker` diretamente.
- `validation.ts` — `makeErrorLookup` puro (usado pelo painel e testável fora do DOM).

Cada `FieldSpec` aceita `visible: (data, ctx) => boolean` — regras condicionais (ex: aviso PTT quando `is_voice && mime não OGG`) viram declaração, não código.

### 2.2 SmartSidebar (componente único)
`src/features/flow-builder/sidebar/`
- `SmartSidebar.tsx` — layout **fixo e imutável**:
  ```
  ┌───────────────────────────┐
  │ Header (ícone · título)   │
  ├───────────────────────────┤
  │ Tabs (Geral · arq. pronta)│
  ├───────────────────────────┤
  │ Conteúdo (fields)         │
  ├───────────────────────────┤
  │ Validação (tempo real)    │
  ├───────────────────────────┤
  │ Preview (card espelho)    │
  ├───────────────────────────┤
  │ Ações: Duplicar · Excluir │
  │        Cancelar · Salvar  │
  └───────────────────────────┘
  ```
- `context.tsx` — `SmartSidebarProvider` injeta agentes/canais/flowId sem prop-drilling.

### 2.3 Extensão do contrato de blocos
`blocks/types.ts` — `BlockDefinition` ganhou `fields?: FieldSpec[]`. `Inspector` permanece como escape hatch para casos exóticos (não usado hoje).

`blocks/definitions.ts` — os **17 blocos legados** foram migrados para a forma declarativa. Zero componente de Inspector custom. Zero switch. Cada bloco declara apenas dados; o painel renderiza.

### 2.4 Store — restauração integral
`state/store.ts` — método novo `replaceNodeData(id, data)`. Cancelar volta o `data` do nó ao estado do momento em que o painel foi aberto, incluindo chaves adicionadas durante a edição.

### 2.5 Shell
`FlowStudioV2.tsx` — trocou `PropertiesPanel` por `<SmartSidebar ctx={sidebarCtx} />`. Contexto memoizado; renderização atômica (só o painel re-renderiza).

### 2.6 Estilos
`src/styles.css` — 15 utilities `smart-sidebar__*` cobrindo header, tabs, busca, corpo, validação, preview, ações.

## 3. Filosofia atendida

| Regra | Como foi cumprida |
| --- | --- |
| Painel único | Só existe `SmartSidebar`. Nenhum Drawer/Modal/Popup por bloco. |
| Layout fixo | Mesma ordem para todos os 17 blocos. Header · Tabs · Conteúdo · Validação · Preview · Ações — nada muda de posição. |
| Componentes únicos | Todos os campos passam pelo `FieldRenderer`. Adicionar `Input` custom vira anti-pattern. |
| Validação tempo real | Combinação `required` do `FieldSpec` + `validate()` do bloco. Aparece antes de clicar em Salvar. |
| Preview inteligente | Card espelho no rodapé reusa a mesma função `preview()` do canvas — atualiza a cada tecla. |
| Salvar instantâneo | Autosave do shell (800ms) continua. Salvar fecha o painel; não trava o Canvas. |
| Cancelar restaura | `replaceNodeData(id, snapshotInicial)` — inclusive remove chaves adicionadas. |
| Tabs (futuro) | `smart-sidebar__tabs` já renderizado com `role="tablist"`. Só "Geral" ativa; adicionar IA/Avançado/Analytics/Debug/Versionamento é acrescentar uma aba. |
| Busca de propriedades (futuro) | Toggle já implementado — filtra `fields` por label/key. Base pronta para Cmd-K. |

## 4. Performance

- **Abrir/fechar/trocar:** instantâneo. Cada `<FieldRenderer>` é isolado; a store usa seletores atômicos (`useSelectedNode`).
- **`key={node.id}`** no `SmartSidebarInner` garante snapshot inicial correto ao trocar de bloco (sem vazamento de estado do bloco anterior).
- **Sem re-render do Canvas** ao editar: o Canvas assina `nodeOrder`/`nodesById` via seletores separados.

## 5. Reuso como componente de plataforma

O `SmartSidebar` foi desenhado para viver fora do Flow Builder:
- não depende de React Flow;
- consome apenas Registry + Store + `SidebarCtx`;
- CRM/Inbox/Automações podem instanciar o mesmo painel passando um Registry próprio.

Missão futura de reuso: extrair o layout para `src/components/smart-sidebar/` quando o segundo consumidor aparecer.

## 6. Testes

`bun test src/features/flow-builder/__tests__/` → **19/19 pass, 98 asserts** (113 ms).

Novo arquivo `__tests__/smart-sidebar.test.ts` cobre:
1. Todos os 17 blocos têm `fields` declarados no Registry.
2. Validação em tempo real sinaliza obrigatório vazio.
3. Validação libera ao preencher.
4. Preview é determinístico (`wait` — 7s / sem tempo).
5. `replaceNodeData` restaura `data` inicial.
6. `replaceNodeData` remove chaves adicionadas depois do snapshot.

Testes visuais (drag/drop, foco) permanecem cobertos por Playwright do shell (FB-03).

## 7. Compatibilidade

- Fluxos existentes abrem sem migração — o serializer não mudou.
- 17 blocos legados renderizam com o novo painel automaticamente.
- Nenhuma coluna nova em `flow_nodes`.
- Runtime, Executor e Event Bus intocados.

## 8. Regras da plataforma (a partir daqui)

1. **Nunca criar Input/Select/Upload novos** em blocos. Estender `FieldSpec` uma vez atinge todo mundo.
2. **Nunca abrir Modal/Drawer para configurar bloco.** Se precisar de mais espaço, virou aba nova no SmartSidebar.
3. **Regra visual (`visible`) sempre declarativa.** Nada de JSX condicional custom.

## 9. Próxima missão sugerida

**FB-05 — Biblioteca universal de campos avançados** (delay composto, condição visual, key-value builder, template com variáveis). Uma vez pronta, a migração dos 17 blocos para novos campos é linha única em `definitions.ts`.

---

**Encerrada.** SmartSidebar operacional, 17 blocos usando o mesmo painel, preview e validação em tempo real, Cancelar restaura o estado, arquitetura pronta para tabs/busca sem tocar em blocos individuais.
