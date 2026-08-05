# FB-05 — Flow Creation Experience (Node Library V2)

**Status:** ✅ Encerrada
**Data:** 2026-07-17
**Missão:** FB-05 · Reconstrução do Flow Builder — experiência de criação
**Escopo:** exclusivamente a forma como o usuário **adiciona, encontra e organiza** blocos.

> **Não alterado (proibições respeitadas):** Runtime, Executor, Banco, SmartSidebar,
> Registry (apenas *consumido*), Store (apenas *chamada*), Canvas (só overlay do
> empty state), Node System, `blocks/definitions.ts`.

---

## 1. Objetivo

Transformar a criação de fluxos na experiência mais rápida e intuitiva possível.
Adicionar um bloco em menos de 2 segundos, encontrar qualquer bloco em menos de 5.

## 2. Entrega

### 2.1 Novo módulo `src/features/flow-builder/library/`

| Arquivo | Papel |
| --- | --- |
| `keywords.ts` | Decoração do Registry com `group`, `aliases`, `keywords`, `examples`. Grupos amigáveis (Comunicação, Arquivos, Lógica, Tempo, IA, Atendimento, CRM, Integrações, Controle). Não altera `definitions.ts`. |
| `search.ts` | Busca **pura** com scoring: label exato > prefixo > alias > short > keyword > grupo > frase composta. Insensível a acento/caixa. Boosts por favoritos/recentes/uso. |
| `preferences.ts` | Favoritos, recentes (MRU, 8 itens), contagem de uso. LocalStorage + evento custom para atualização reativa multi-abas. |
| `insert.ts` | **Inserção inteligente**: isolada, conectada a partir de nó de origem, ou **split de aresta** (A→B → A→X→B). Registra uso automaticamente. |
| `context.tsx` | `LibraryProvider` + hook `useLibrary()`. Registra atalho global **Ctrl/⌘+K**. |
| `BlockRow.tsx` | Card único usado por sidebar e palette — drag & drop, hover, favorito, teclado. |
| `PreviewCard.tsx` | Ícone + descrição + categoria + exemplo real de uso. |
| `NodeLibraryV2.tsx` | Sidebar. Seções: Favoritos → Recentes → Mais utilizados → Grupos por objetivo. Busca com atalho `/`. Pré-visualização flutuante ao lado. |
| `CommandPalette.tsx` | Modal Cmd/⌘+K. Layout lista + preview. Navegação por setas, Enter insere, Esc fecha. Autofoco na busca. |
| `EmptyState.tsx` | Overlay sobre o canvas quando o fluxo tem só o `start`. CTA principal abre o palette já com `sourceNodeId=start` (inserção conectada). |

### 2.2 Shell atualizado

`FlowStudioV2.tsx` — envolve tudo em `<LibraryProvider>`, troca `BlockLibrary` legado por `NodeLibraryV2`, injeta `EmptyState` sobre o canvas quando `nodeIds.length <= 1`. Nenhuma outra alteração.

### 2.3 Estilos

`src/styles.css` — 40+ utilities `fbv2-lib__*` cobrindo sidebar, seções, cards, preview, palette (grid lista + preview + footer com kbd), empty state (glassmorphism + CTA + tips).

## 3. Filosofia atendida

| Regra | Como foi cumprida |
| --- | --- |
| Registry único, sem lista manual | `blockRegistry.list().map(toLibraryItem)` — qualquer `register()` novo aparece instantaneamente. |
| Busca instantânea | `onChange` no input dispara filtro; sem botão, sem Enter, sem debounce visível. |
| Pesquisa por sinônimos | 15+ aliases por bloco (`mensagem/texto/enviar/resposta` → `message`). Termos como `imagem`, `pdf`, `voz`, `gpt`, `if`, `webhook`, `atendente` batem no bloco esperado. |
| Organização por contexto | Grupos por **objetivo** (Comunicação/Arquivos/…) — não por tipo técnico do banco. Novo grupo = novo string em `LIBRARY_GROUPS`. |
| Favoritos | Toggle na estrela. Aparecem na 1ª seção. LocalStorage. |
| Recentes | Últimos 8 utilizados, MRU, sem duplicatas. |
| Mais utilizados | Ordenação dinâmica pelo contador. Top 5 aparecem em seção dedicada. |
| Inserção inteligente | Bloco entra **automaticamente conectado** ao nó selecionado. Palette em split de aresta divide (A→B → A→X→B). Empty state insere conectado ao `start`. |
| Pré-visualização | `PreviewCard` mostra ícone + descrição + grupo + exemplo + aliases — sem abrir o SmartSidebar. |
| Navegação por teclado | Ctrl/⌘+K abre palette. `/` foca a busca do sidebar. Setas ↑↓ + Enter + Esc no palette. Enter em row da sidebar insere. |
| Drag & Drop | Payload `application/x-flow-block` (compatível com Canvas). Cursor grab/grabbing. Ghost nativo com accent do bloco. |
| Estado vazio | Overlay guiado com CTA principal, sugestões de termos e cheatsheet de atalhos. |
| Escala 500+ blocos | Renderização por seção + `filter` O(n) puro; nenhum re-render extra do canvas. Registry `list()` estável durante a vida do editor. |
| Reuso | Sidebar, palette, preview e row são componentes desacoplados. `LibraryProvider` pode ser instanciado em qualquer módulo (CRM, IA, Automações) — depende só do Registry consumido. |

## 4. Testes

`bun test src/features/flow-builder/__tests__/` → **37 pass · 170 asserts · 163 ms**

Novo `__tests__/library.test.ts` (18 casos):

1. Registry cobre os 17 kinds legados.
2. Todo kind decorado usa um grupo válido.
3. Busca por label (`mensagem` → `message`).
4. Busca por sinônimos (`texto`, `enviar`, `resposta` → `message`).
5. Insensível a caixa e acento (`IMAGEM`, `condicao`).
6. Frase composta (`enviar imagem`).
7. Termo vazio devolve tudo.
8. Score: exato > alias > keyword > categoria.
9. `groupItems` monta grupos amigáveis.
10. `toggleFavorite` idempotente.
11. `pushRecent` MRU sem duplicatas.
12. `bumpUsage` acumula.
13. Boosts de favorito no ranking.
14. Inserção isolada.
15. Inserção conectada com `sourceNodeId`.
16. Split de aresta (A→B → A→X→B) — aresta original apagada.
17. Inserção registra uso e recente.
18. Kind inexistente devolve `null` sem alterar store.

## 5. Compatibilidade

- Todos os blocos legados aparecem sem cadastro extra (Registry).
- `blocks/definitions.ts` intocado.
- Store recebe apenas chamadas públicas já existentes (`addNode`, `connect`, `disconnect`, `selectNode`).
- Canvas continua consumindo `application/x-flow-block` no drop — payload igual.
- `BlockLibrary` legada permanece no repo pois é usada pela rota V1 (`_authenticated.flows.$flowId.tsx`); nenhuma mudança quebra o V1.

## 6. Métrica de sucesso (autoavaliação)

- **Novo usuário cria um fluxo simples sem treinamento?** Sim — empty state guia o primeiro clique.
- **Encontrar um bloco em ≤ 5 s?** Ctrl+K + termo natural (mensagem/imagem/pergunta/IA) resolve em 1 tecla + 1 palavra.
- **Menor número de cliques?** 1 clique no sidebar OU 1 tecla no palette + Enter = inserido e conectado.
- **Fluida com centenas de blocos?** Registry O(n) + secções colapsáveis + preview sob demanda; sem re-render do Canvas.
- **Só Registry?** Confirmado — grep `list()` é o único ponto de leitura de blocos.

## 7. O que ficou fora (por design)

- Marketplace de blocos (backend). A base já suporta: qualquer `blockRegistry.register()` em runtime aparece no sidebar/palette.
- "+" mid-edge no canvas. O split funciona hoje via `insertBlock({edgeId})`; expor um botão gráfico sobre a aresta requer edge custom no React Flow — próxima missão do Canvas.

## 8. Próxima missão sugerida

**FB-06 — Undo/Redo & Multi-seleção avançada** (copy/paste de subgrafos, agrupamento, teclas rápidas). A base de patches imer já está em `history/patches.ts`.

---

**Encerrada.** Node Library V2 operacional. Busca inteligente, favoritos, recentes, mais utilizados, inserção inteligente (isolada, conectada, split de aresta), palette Ctrl/⌘+K, atalho `/`, empty state guiado, drag & drop preservado. Registry-only, sem lista manual. 37/37 testes verdes.
