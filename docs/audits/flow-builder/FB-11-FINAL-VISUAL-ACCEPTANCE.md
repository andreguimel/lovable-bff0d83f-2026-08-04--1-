# FB-11 · GATE VISUAL FINAL — Flow Builder V1

Data: 2026-07-19
Tipo: Auditoria visual read-only (nenhum código alterado)
Escopo: Estado real do Flow Builder após FB-11.EXEC, comparado com referência BotConversa

---

## 1. Método

- App autenticado como tenant WebMarcas (`http://localhost:8080/flows`).
- Percorreu 2 fluxos reais (`teste` vazio, `Davilys (cópia)` com 16 blocos publicados).
- Captura em resolução desktop 1440×900 via Playwright.
- Clique em cada nó existente para inspeção dos painéis.
- Screenshots armazenados em `/mnt/documents/fb11-visual/`.

Fluxo `Davilys (cópia)` só cobre um subconjunto (`start`, `wait`, `send_file`, `send_image`, `ask_question`). Blocos Menu, Ação, Condição, Randomizador, Conexão de Fluxo, Integração HTTP e Assistente IA foram validados via Command Palette (todos os 21 kinds listados) e via inspeção da definição no código — não via card configurado neste fluxo. Um fluxo demo com os 12 blocos solicitados não pôde ser construído no gate porque o gate é read-only sobre o estado atual do tenant.

---

## 2. Screenshots capturados

Todos em `/mnt/documents/fb11-visual/`:

| # | Arquivo | Cena |
|---|---------|------|
| 1 | `01_flows_list.png` | Página de listagem de fluxos |
| 2 | `02_builder_open.png` | Builder ao abrir fluxo vazio (empty state) |
| 3 | `03_canvas_medium.png` | Canvas do fluxo real em zoom padrão |
| 4 | `04_canvas_fit.png` | Canvas após `fit-view` |
| 5 | `06_properties_first.png` | Primeiro painel de propriedades ativo |
| 6 | `07_node_00..11.png` | Painéis de cada nó do fluxo Davilys |
| 7 | `08_library_full.png` | Biblioteca V3 completa (categorias + cards) |
| 8 | `09_command_palette.png` | Command Palette (⌘K) |

Cobertura por painel solicitado:

- Painel Conteúdo (Enviar mensagem/arquivo/imagem/pergunta) → **coberto** (`07_node_04.png`, `07_node_06.png`, `07_node_08.png`).
- Painel Aguardar → **coberto** (`07_node_00.png`).
- Painel Início → **coberto** (`07_node_10.png`).
- Painel Menu / Ação / Condição / Randomizador / Conexão / Integração / IA → **NÃO coberto neste fluxo** (o tenant não possui esses blocos configurados hoje). Registro explícito no gate.

---

## 3. Estado versus os 8 problemas anteriores

| # | Regra | Status | Evidência |
|---|-------|--------|-----------|
| A1 | Categorias da biblioteca não podem exibir "Nenhum bloco disponível" quando há blocos | **PASS** | `08_library_full.png` — todas as 10 categorias renderizam cards; nenhuma exibe estado vazio |
| A2 | Sem cards fantasmas / elementos residuais no canvas | **PASS** | `03_canvas_medium.png`, `04_canvas_fit.png` — nenhum node órfão fora do grafo |
| A3 | Categorias apresentadas como funcionais têm bloco correspondente | **PARCIAL** | Categoria **"Atraso Inteligente"** aparece nas abas (`08_library_full.png`) — apesar de haver o bloco `wait`, o rótulo sugere um tipo de inteligência que ainda não foi entregue (roadmap V2). Recomenda-se renomear para "Aguardar" ou remover a categoria |
| A4 | Canvas deve ser protagonista | **FAIL** | Biblioteca fixa ~400px + painel de propriedades ~320px consomem >50% da largura em 1440px. Canvas efetivo ≤720px. BotConversa mantém biblioteca ~220px colapsável |
| A5 | Cards legíveis em fluxo real | **PARCIAL** | Em zoom padrão (`03_canvas_medium.png`) a fileira de topo aparece muito pequena; textos ilegíveis. `fit-view` (`04_canvas_fit.png`) piora ainda mais |
| A6 | Layout não espalha demais | **FAIL** | Grafo tem uma linha horizontal de 11 nós no topo + coluna solta de 5 nós à esquerda. Não há auto-layout aplicado ao abrir |
| A7 | Experiência principal não dependente exclusiva do Command Palette | **PASS parcial** | Biblioteca lateral + drag-and-drop + tabs por categoria estão presentes. Command Palette é atalho, não requisito |
| A8 | Adicionar → configurar → conectar simples e intuitivo | **PARCIAL** | Empty state (`02_builder_open.png`) é claro. Modo "click-para-conectar" tem hint textual no rodapé da biblioteca ("Bloco selecionado — clique em outro para conectar"), porém sem indicação visual no nó de origem |

---

## 4. Comparação BotConversa × Zenda ANTES × Zenda AGORA

Nota: as pontuações refletem apenas o material visível neste gate. "Zenda ANTES" refere-se ao estado descrito no aceite negativo anterior (cards grandes, sem edge labels, sem toggle de densidade). "Zenda AGORA" reflete os artefatos deste gate.

| Dimensão | BotConversa (ref) | Zenda ANTES | Zenda AGORA | Delta |
|---------------------------------|:---:|:---:|:---:|:---:|
| Predominância do canvas         | 92  | 45  | 55  | +10 |
| Arquitetura da paleta           | 88  | 55  | 68  | +13 |
| Facilidade para adicionar bloco | 90  | 60  | 72  | +12 |
| Facilidade para configurar      | 85  | 70  | 78  | +8  |
| Legibilidade dos cards          | 88  | 55  | 62  | +7  |
| Densidade do fluxo              | 90  | 40  | 58  | +18 |
| Organização espacial            | 88  | 45  | 50  | +5  |
| Conexões (traçado)              | 88  | 70  | 78  | +8  |
| Handles e ramificações          | 90  | 65  | 72  | +7  |
| Facilidade operacional geral    | 90  | 55  | 66  | +11 |
| Fidelidade à referência         | 100 | 45  | 60  | +15 |

**Paridade estimada com a referência: 66/100.**

Progresso real desde o aceite negativo anterior, porém abaixo do patamar de aceite visual "BotConversa-like".

---

## 5. Diferenças estruturais restantes vs. BotConversa

1. **Canvas comprimido pela biblioteca fixa.** A library ainda ocupa ~400px estáticos. BotConversa colapsa para ~48px após o primeiro drag ou mantém ~220px. Precisa de collapse persistido.
2. **Falta auto-layout ao abrir.** BotConversa alinha em colunas verticais lógicas; Zenda mantém posições absolutas herdadas de edições humanas. Fluxos importados/migrados ficam com layout ruim.
3. **Fit-view não converge para densidade legível.** Em fluxos médios (≥10 nós) o fit-view reduz cards a ~80px de largura, ilegíveis. Precisa de padding mínimo e cap de zoom-out.
4. **Edge labels ("Sim/Não/Inválido") não observados** no fluxo real capturado — isto pode ser porque o fluxo Davilys não tem Condição/Menu, mas não há evidência visual no gate. Precisa ser validado em um fluxo demo com Menu/Condição.
5. **Modo "compactar/expandir"** anunciado no FB-11.EXEC **não é visível no toolbar** do canvas capturado (`03_canvas_medium.png`). Pode estar oculto atrás de menu, mas não passa no teste de descoberta imediata.
6. **Categoria "Atraso Inteligente"** carrega expectativa maior do que a implementação (bloco `wait` simples). Rebranding necessário.
7. **Painel de propriedades ocupa lateral inteira** (~320px fixos). BotConversa usa modal ou sidebar mais estreito com formulários compactos.
8. **Empty state central bloqueia visão do canvas** — aceitável, mas o balão "Comece adicionando..." sobrepõe a área útil.
9. **Preview do canvas dentro do painel de propriedades** é redundante — repete o que o card já mostra no grafo.
10. **Confirmação visual de "modo conectar"** é apenas textual no rodapé da biblioteca — BotConversa destaca o nó de origem com halo/anel.

---

## 6. Resposta ao gate

**FB-11 — GATE VISUAL FINAL**

Status funcional interno:
PASS (309/314 testes; 5 falhas pré-existentes Guardian Alerter Bun/Vitest)

Status visual:
AGUARDANDO ACEITE DO PROPRIETÁRIO

Paridade estimada com a referência:
66/100

A1 Library:
PASS

A2 Cards fantasmas:
PASS

A3 Categorias:
PARCIAL (categoria "Atraso Inteligente" sugere funcionalidade além do bloco `wait` entregue)

Canvas dominance:
55/100 (biblioteca + propriedades consomem >50% da largura em 1440px)

Legibilidade:
62/100 (zoom padrão empurra cards da fileira principal para tamanhos abaixo do confortável; fit-view piora)

Facilidade operacional:
66/100 (adicionar via drag e via palette funciona; conectar depende de hint textual no rodapé, sem realce visual no nó de origem)

Principais diferenças restantes:
- Biblioteca fixa ocupando ~400px sem collapse persistido
- Ausência de auto-layout / re-arrange ao abrir fluxo
- Fit-view sem cap de zoom-out (cards ilegíveis em fluxos ≥10 nós)
- Edge labels Sim/Não/Inválido não verificados em fluxo real
- Toggle de densidade compactar/expandir não visível no toolbar
- Categoria "Atraso Inteligente" com rótulo enganoso
- Painel de propriedades lateral fixo (~320px) sem modo compacto
- "Modo conectar" sem realce visual no nó de origem

Screenshots:
`/mnt/documents/fb11-visual/` (01_flows_list.png, 02_builder_open.png, 03_canvas_medium.png, 04_canvas_fit.png, 06_properties_first.png, 07_node_00..11.png, 08_library_full.png, 09_command_palette.png)

Código alterado:
NÃO

Próximo gate após aceite visual:
W3 — WHATSAPP CLOUD PROVIDER ACCEPTANCE

PARE E AGUARDE MEU ACEITE VISUAL.
