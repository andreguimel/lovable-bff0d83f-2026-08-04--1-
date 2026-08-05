# FB · AUDITORIA VISUAL FINAL — Flow Builder

Data: 2026-07-19
Tipo: Auditoria read-only. **Nenhum código alterado.**
Referência: BotConversa (fornecida pelo proprietário em turnos anteriores)
Evidências: `/mnt/documents/fb11-visual-v2/`
Diretriz global aplicada: **desenvolvimento interno**, sem exigência de provider real; foco absoluto em finalizar o Flow Builder antes de qualquer outro módulo.

---

## 0. Sumário executivo

O Flow Builder está **funcionalmente parcial** e **visualmente distante** da paridade com BotConversa.

Descoberta crítica desta auditoria (não capturada em FB-10 / FB-11 anteriores):

> **P0 · BUG CRÍTICO DE PERSISTÊNCIA — enum `VALID_NODE_KINDS` em `src/lib/flows.functions.ts:206` NÃO contém `menu`, `randomizer`, `flow_connection`, `send_file`, `action`.**
>
> Consequência: qualquer fluxo que use um bloco introduzido em FB-10.4A (Menu), FB-10.4B (Ação), FB-10.4C (Conexão de Fluxo) ou FB-10.4D (Randomizador) **falha ao salvar** com toast `"Erro ao salvar"` e não pode ser publicado. A cadeia UI → Store → Serializer aceita esses kinds, mas o `inputValidator` da server function `saveFlow` rejeita.
>
> Este bug **invalida o status "INTERNALLY PRODUCTION READY"** declarado no FLOW-BUILDER-V1-FREEZE. Os testes internos passaram porque exercitam o executor e o registry, não o round-trip real UI → banco.

Paridade estimada com a referência: **62 / 100.**

---

## 1. Método

- Sessão autenticada como tenant WebMarcas.
- Playwright 1440×900, sem alteração de código.
- Cada uma das 10 abas da biblioteca foi clicada e capturada; texto "Nenhum bloco disponível" foi contado programaticamente (**0 ocorrências**).
- Command Palette usado para inserir Menu, Condição, Ação, Randomizador, Conexão de Fluxo, HTTP e IA num fluxo real; painel de configuração de cada tipo capturado.
- Canvas capturado em zoom padrão e em zoom-out (4 níveis).
- Enum de persistência verificado por leitura direta de `src/lib/flows.functions.ts` (linhas 206-226).

---

## 2. Screenshots (evidências)

Todas em `/mnt/documents/fb11-visual-v2/`.

| Cena | Arquivo |
|------|---------|
| Aba biblioteca — Tudo | `lib_00_Tudo.png` |
| Conteúdo | `lib_01_Conteúdo.png` |
| Menu | `lib_02_Menu.png` |
| Ação | `lib_03_Ação.png` |
| Condição | `lib_04_Condição.png` |
| Conexão de Fluxo | `lib_05_Conexão_de_Fluxo.png` |
| Randomizador | `lib_06_Randomizador.png` |
| Atraso Inteligente | `lib_07_Atraso_Inteligente.png` |
| Integração | `lib_08_Integração.png` |
| Assistente IA | `lib_09_Assistente_IA.png` |
| Sistema | `lib_10_Sistema.png` |
| Command Palette completo | `palette_all.png` |
| Painel Menu | `panel_menu.png` |
| Painel Condição | `panel_condition.png` |
| Painel Ação | `panel_action.png` |
| Painel Randomizador | `panel_randomizer.png` |
| Painel Conexão de Fluxo | `panel_flow_connection.png` |
| Painel HTTP | `panel_http.png` |
| Painel IA | `panel_ai.png` |
| Canvas com 7 blocos inseridos | `canvas_with_all_blocks.png` |
| Canvas em zoom-out | `canvas_zoomout.png` |

---

## 3. Matriz de paridade BotConversa × Zenda atual

Status: **PASS** / **PARCIAL** / **FAIL**

| # | Aspecto | BotConversa (ref) | Zenda atual | Status | Ação necessária |
|---|---------|-------------------|-------------|--------|-----------------|
| P1 | Biblioteca — categorias vazias | Nunca exibe | Nenhuma exibe "Nenhum bloco disponível" | **PASS** | — |
| P2 | Biblioteca — largura | ~220px colapsável | ~272px fixa; sem persistência do collapse | PARCIAL | Colapso persistido + largura menor |
| P3 | Biblioteca — categorias exibidas com bloco correspondente | Sim | Sim, todas as 10 abas populadas | **PASS** | — |
| P4 | Category "Atraso Inteligente" rótulo | N/A | Rótulo sugere inteligência inexistente (só Aguardar / Aguardar resposta) | PARCIAL | Renomear para "Aguardar" |
| P5 | Canvas — cards fantasmas | Nunca | Não observado | **PASS** | — |
| P6 | Canvas — dominância | ≥70% da tela | ~58% em 1440×900 | PARCIAL | Reduzir biblioteca e painel de propriedades |
| P7 | Cards — largura | ~180-220px estreitos | ~200px OK, mas altura excessiva (badges, descrição, chevron) | PARCIAL | Modo compacto padrão |
| P8 | Cards — legibilidade em zoom-out | Texto lisível até ~40% | Ilegível abaixo de 60% | PARCIAL | Placeholder minimalista em baixo zoom |
| P9 | Auto-layout | Aplica ao abrir e ao inserir | Nenhum | **FAIL** | Auto-layout dagre ao abrir + botão manual |
| P10 | Fit-view | Cap de zoom garantindo leitura | Sem cap → cards viram pontos | **FAIL** | Cap min-zoom=0.6 no fit-view |
| P11 | Edge labels Sim/Não/Inválido | Sempre visíveis | Componente existe (`SoftCurvedEdge`), mas nenhum bloco Menu/Condição/Randomizador consegue ser salvo → labels não observáveis no round-trip | **FAIL** (bloqueado por P0) | Corrigir P0 e revalidar |
| P12 | Handles por saída (Menu 1..n + Inválido; Condição Sim/Não; Randomizador 1..n) | Explícitos e coloridos | Renderizados no card, mas não testáveis por P0 | PARCIAL | Corrigir P0 |
| P13 | Inserir bloco por clique na saída (add-on-handle) | Central | Não observado — apenas drag ou palette ou clique na biblioteca com nó selecionado | **FAIL** | Implementar `+` no handle → mini-palette |
| P14 | Drag da biblioteca | Sim | Sim | **PASS** | — |
| P15 | Command Palette (⌘K) | Não é o meio principal | Sim, presente, 21 kinds listados | **PASS** | — |
| P16 | Painel lateral de configuração | Modal ou drawer estreito | Drawer fixo ~320px | PARCIAL | Compactar formulários |
| P17 | Painel — preview do card | Não redundante | Card "Prévia no canvas" duplica o próprio card no grafo | PARCIAL | Remover ou tornar opcional |
| P18 | Painel — mensagem de erro visível | Ao lado do campo | Toast + banner de rodapé + underline no campo — bom | **PASS** | — |
| P19 | Toolbar do canvas — toggle compactar | Padrão | Não visível no toolbar capturado | **FAIL** | Adicionar toggle no toolbar |
| P20 | Save/Reload preservando 100% | Sim | **NÃO** — blocos novos não persistem | **FAIL** (P0) | Corrigir enum |
| P21 | Publish funcionando | Sim | Bloqueado enquanto houver bloco não persistente | **FAIL** (P0) | Corrigir P0 |
| P22 | Test mode | Sim | Botão "Testar" presente, não exercitado nesta auditoria | PARCIAL | Validar após P0 |
| P23 | Runtime interno | Sim | Testes cobrem executor (Menu/Ação/Condição/Randomizador/HTTP/AI); runtime não é o gargalo | **PASS** | — |
| P24 | Health/Saúde | Bloqueia publicação com erro | Presente (`Saúde 0` / `95`); dispara underline nos campos vazios | **PASS** | — |
| P25 | Empty state ao abrir fluxo vazio | Discreto | Card central "Comece adicionando…" — grande e cobre canvas | PARCIAL | Reduzir para banner de topo |
| P26 | Modo "click-para-conectar" | Halo no nó de origem | Apenas hint textual no rodapé da biblioteca | PARCIAL | Anel visual no nó selecionado |
| P27 | Cores por tipo de bloco | Consistentes | Presentes e distinguíveis | **PASS** | — |
| P28 | Ícones por tipo | Consistentes | Presentes | **PASS** | — |
| P29 | Toast "Erro ao salvar" auto-dismiss | N/A | Persiste; sobrepõe painel; bloqueia leitura | **FAIL** | Auto-dismiss + área não invasiva |

---

## 4. Bugs visuais encontrados

| ID | Severidade | Descrição | Evidência |
|----|-----------|-----------|-----------|
| V1 | Alto | Toast "Erro ao salvar" sobrepõe o painel de propriedades em posição fixa, ocultando conteúdo | `panel_condition.png`, `panel_action.png` |
| V2 | Alto | `fit-view` reduz cards a pontos ilegíveis em fluxos ≥7 nós | `canvas_zoomout.png` |
| V3 | Médio | Nenhuma indicação visual de "modo conectar" no nó selecionado; apenas hint textual no rodapé | `canvas_with_all_blocks.png` |
| V4 | Médio | Empty state "Comece adicionando seu primeiro bloco" domina o canvas em fluxo vazio | `02_builder_open.png` (turno anterior) |
| V5 | Médio | Painel de propriedades duplica o card do bloco em "Prévia no canvas" | `panel_menu.png` |
| V6 | Baixo | Rótulo "Atraso Inteligente" na aba da biblioteca é enganoso — só há `wait` e `wait_reply` simples | `lib_07_Atraso_Inteligente.png` |
| V7 | Baixo | Barra superior do fluxo mostra "Salvando…" indefinidamente quando o save falha | `panel_menu.png` |
| V8 | Baixo | Toggle "compactar/expandir" anunciado no FB-11.EXEC não é visível no toolbar do canvas | qualquer canvas |

---

## 5. Bugs funcionais encontrados

| ID | Severidade | Descrição | Impacto | Evidência |
|----|-----------|-----------|---------|-----------|
| **F1** | **CRÍTICO / P0** | `VALID_NODE_KINDS` em `src/lib/flows.functions.ts:206` **não inclui** `menu`, `randomizer`, `flow_connection`, `send_file`, `action` — bloqueia save/publish de qualquer fluxo que use blocos FB-10.4A/B/C/D | Todos os blocos entregues em FB-10.4A/B/C/D **não são persistíveis** em produção | Toast do painel Condição/Ação/Randomizador/HTTP; código lido |
| F2 | Alto | Sem auto-layout: fluxos importados/migrados abrem com posições ruins (fluxo Davilys mostra linha horizontal + coluna solta) | Fluxos grandes ilegíveis | `04_canvas_fit.png` (turno anterior) |
| F3 | Alto | Sem "add-on-handle" (clicar `+` na saída para inserir próximo bloco). Referência BotConversa apoia todo o fluxo operacional nisto | Cada conexão exige drag manual do card para o handle → operação lenta | `canvas_with_all_blocks.png` — nós desconectados |
| F4 | Médio | Fit-view sem cap de zoom mínimo | Perda de leitura em fluxos ≥7 nós | `canvas_zoomout.png` |
| F5 | Médio | "Modo conectar após selecionar" descoberto apenas via leitura do rodapé | Baixa descoberta | `panel_menu.png` rodapé |
| F6 | Médio | Empty state central bloqueia canvas; sem opção de dispensar | Frustração ao abrir fluxo vazio | `02_builder_open.png` |
| F7 | Baixo | "Recentes" na biblioteca cresce sem limite e ocupa espaço | Perda de espaço vertical | `panel_http.png` |

Observação sobre F1: os testes automatizados citados na FB-10.4A/B/C/D exercitam o `executor.server.ts` e o `registry`, não a server function `saveFlow` + o zod schema `nodeInput`. Por isso o bug passou despercebido em regressão.

---

## 6. Diferenças de UX vs. BotConversa

1. **Adicionar → conectar em um gesto.** BotConversa: clico no `+` da saída, escolho o tipo, o bloco nasce já conectado. Zenda: preciso arrastar da biblioteca, então clicar no handle de origem, então clicar no handle de destino.
2. **Densidade padrão.** BotConversa abre em modo compacto por default; Zenda abre expandido.
3. **Biblioteca colapsável.** BotConversa colapsa a biblioteca para uma coluna de ícones após o primeiro drag; Zenda mantém fixa.
4. **Painel de propriedades.** BotConversa usa modal contextual sobre o canvas; Zenda usa drawer lateral fixo que rouba espaço.
5. **Auto-layout.** BotConversa arruma verticalmente ao abrir; Zenda respeita posições absolutas do banco.
6. **Feedback visual de estado.** BotConversa marca claramente nó "sendo editado" e nó "origem da conexão em curso"; Zenda usa hint textual.

---

## 7. O que preservar (não mexer)

- Registry de 21 kinds — completo.
- Runtime canônico (`flow-executor.server.ts`) — passou nos testes internos.
- Segurança SSRF do bloco HTTP.
- Health checks (`rules.ts`) — funcionando.
- Definição estrutural do canvas com React Flow — sólida.
- Command Palette — bom como atalho complementar.
- Cores e ícones por kind — visualmente coerentes.

---

## 8. Componentes a corrigir (edit surgical)

| Componente | Correção |
|------------|----------|
| `src/lib/flows.functions.ts` (linha 206) | Estender `VALID_NODE_KINDS` para todos os 21 kinds do registry. Idealmente derivar do registry para evitar drift futuro |
| `SoftCurvedEdge.tsx` | Já suporta labels — validar após corrigir F1 |
| Toolbar do `FlowCanvasV2` | Expor toggle "compactar", "auto-layout" e "fit útil" |
| `BlockNodeV3` | Anel visual quando selecionado em modo conectar |
| Toast de erro | Auto-dismiss + posição não invasiva |
| Empty state | Reduzir para banner de topo |

## 9. Componentes a redesenhar

| Componente | Motivo | Alvo |
|------------|--------|------|
| `NodeLibraryPanelV3` | Largura fixa; sem collapse persistido; sem modo icon-only | Coluna colapsável tipo BotConversa |
| Painel de propriedades (`PropertiesPanel`) | Ocupa lateral fixa; duplica preview | Drawer contextual estreito ou modal ancorado ao nó |
| Handles do `BlockNodeV3` | Sem "add-on-handle" | `+` clicável em cada handle → mini-palette |
| Auto-layout | Inexistente | dagre integrado com botão "Organizar" e execução automática ao abrir fluxo sem posições humanas |

---

## 10. Plano de execução — missões pequenas

Ordem sugerida por dependência e risco de regressão.

### FB-12.1 · P0 Persistence Fix  ·  RISCO: BAIXO
Escopo: estender `VALID_NODE_KINDS` para os 21 kinds; derivar do registry; regressão do round-trip UI → banco por bloco novo; smoke Playwright.
Aceite: salvar/publicar/reload preserva 100% de qualquer bloco.
Testes: adicionar teste específico de round-trip para cada kind novo.

### FB-12.2 · Auto-layout dagre  ·  RISCO: BAIXO
Escopo: instalar `dagre`, aplicar layout ao abrir se nenhum nó tem coordenadas humanas; botão "Organizar" no toolbar.
Aceite: fluxos importados abrem em colunas verticais legíveis.

### FB-12.3 · Fit-view útil  ·  RISCO: MUITO BAIXO
Escopo: cap `minZoom=0.55` no fit-view; padding maior.
Aceite: fluxo de 20 nós continua com cards legíveis após fit.

### FB-12.4 · Add-on-handle  ·  RISCO: MÉDIO
Escopo: renderizar botão `+` em cada handle de saída; mini-palette contextual (top 6 kinds por categoria do handle); ao escolher, cria nó em posição sugerida e conecta.
Aceite: operador consegue montar um fluxo de 10 blocos sem arrastar nada.

### FB-12.5 · Biblioteca colapsável  ·  RISCO: BAIXO
Escopo: modo icon-only 48px; toggle persistido em `localStorage`.
Aceite: canvas ganha ≥180px quando colapsada.

### FB-12.6 · Painel de propriedades compacto  ·  RISCO: MÉDIO
Escopo: reduzir largura para 288px; remover "Prévia no canvas"; formulários com espaçamento menor.
Aceite: canvas mantém ≥65% da largura em 1440×900.

### FB-12.7 · Empty state discreto + hint visual de conexão  ·  RISCO: MUITO BAIXO
Escopo: banner de topo dispensável; anel primary no nó em modo conectar.
Aceite: canvas sempre visível; usuário sabe visualmente onde vai partir a conexão.

### FB-12.8 · Rebranding "Atraso Inteligente" → "Aguardar"  ·  RISCO: MUITO BAIXO
Escopo: rename da categoria e do tab.
Aceite: aba consistente com o conteúdo.

### FB-12.9 · Gate visual final  ·  RISCO: ZERO
Escopo: refazer esta auditoria; comparar; pedir aceite explícito do proprietário.

---

## 11. Critério objetivo de aceite final

O Flow Builder só pode ser declarado FINALIZADO quando **todos** os itens abaixo estiverem verdes simultaneamente:

- Biblioteca: 10/10 abas populadas · **hoje: PASS**
- Cards fantasmas: nenhum · **hoje: PASS**
- Round-trip UI → banco → UI: 21/21 kinds preservados · **hoje: FAIL (P0)**
- Publicação: sucesso com pelo menos 1 fluxo contendo todos os blocos novos · **hoje: FAIL**
- Auto-layout: ao abrir, fluxo sem posições humanas fica legível · **hoje: FAIL**
- Fit-view: cards continuam legíveis em fluxo de 20 nós · **hoje: FAIL**
- Add-on-handle: presente e funcional em todos os handles de saída · **hoje: FAIL**
- Biblioteca colapsável com estado persistido · **hoje: FAIL**
- Painel de propriedades ≤ 300px de largura · **hoje: FAIL (~320px)**
- Empty state não bloqueia canvas · **hoje: FAIL**
- Toast de erro auto-dismiss e não invasivo · **hoje: FAIL**
- Regressão automatizada: ≥ 95% PASS (excluindo Guardian Alerter pré-existente) · **hoje: PASS (309/314)**
- Typecheck: PASS · **hoje: PASS**
- Critical: 0 · **hoje: 1 (F1)**
- High: 0 · **hoje: 3 (F2, F3, V1)**
- Aceite visual explícito do proprietário · **hoje: PENDENTE**

Provider WhatsApp real **não** faz parte deste gate. Será tratado somente na fase FINAL PLATFORM ACCEPTANCE.

---

## 12. Estimativa de risco de regressão por missão

| Missão | Risco de regressão | Mitigação |
|--------|--------------------|-----------|
| FB-12.1 Persistence Fix | Baixo | Testes específicos de round-trip por kind; comparar snapshot antes/depois |
| FB-12.2 Auto-layout | Baixo | Aplicar somente quando `nodes[].position` estiver default; feature flag inicial |
| FB-12.3 Fit-view útil | Muito baixo | Ajuste isolado no callback do controle |
| FB-12.4 Add-on-handle | Médio | Nova UI perto de área sensível a drag do React Flow; testar drag simultâneo |
| FB-12.5 Biblioteca colapsável | Baixo | Estado local; toggle não afeta grafo |
| FB-12.6 Painel compacto | Médio | Formulários já existentes; risco de quebrar responsividade de campos longos |
| FB-12.7 Empty state + hint | Muito baixo | CSS + condicional |
| FB-12.8 Rebranding | Muito baixo | String only |
| FB-12.9 Gate visual | Zero | Read-only |

---

## 13. Resposta ao gate

**FB — GATE VISUAL FINAL**

Status funcional interno declarado anteriormente:
INTERNALLY PRODUCTION READY

Status funcional real após esta auditoria:
**INTERNALLY BROKEN — P0 de persistência bloqueia save/publish de todos os blocos FB-10.4A/B/C/D**

Status visual:
**AGUARDANDO ACEITE DO PROPRIETÁRIO**

Paridade estimada com a referência:
**62 / 100**

A1 Library ("Nenhum bloco disponível"):
**PASS** (0 ocorrências em 10 abas)

A2 Cards fantasmas:
**PASS**

A3 Categorias falsas:
**PARCIAL** (Atraso Inteligente é rótulo enganoso; a categoria tem 2 blocos simples)

Canvas dominance:
58 / 100

Legibilidade em zoom:
55 / 100

Facilidade operacional:
50 / 100 (sem add-on-handle; auto-layout inexistente)

Bugs críticos abertos:
1 (F1)

Bugs altos abertos:
3 (F2, F3, V1)

Screenshots:
`/mnt/documents/fb11-visual-v2/` (21 arquivos)

Código alterado:
**NÃO**

Próxima ação (após aceite do plano):
FB-12.1 (Persistence Fix) — pré-requisito para qualquer outra missão de UX
