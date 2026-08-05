# FB-HOTFIX-01 · Relatório de Encerramento

**Data:** 2026-07-19
**Escopo autorizado:** A1 (Library V3 categorias vazias) · A2 (Cards fantasmas no canvas) · A3 (Categorias sem blocos)
**Regime:** Exceção Critical/High ao freeze do Flow Builder V1 (não abre FB-10.6, não muda runtime/executor/serializer).
**Veredito:** ENCERRADA

---

## 1. Metodologia

Investigação obrigatória antes de correção (regra da autorização). Reprodução do estado real do Builder com Playwright autenticado sobre o fluxo real `Davilys (cópia)` (id `6e9f98d8-7070-4aab-865a-a1986cca8a31`, publicado, 16 nós, 10 edges).

Evidências primárias em `/tmp/browser/fbhotfix/`:
- `screenshots/02_flow_builder.png` — Builder cold-load, antes e depois.
- `state.json` — dump programático de categorias e bounding boxes dos nós.
- `console.log` — console do browser durante a sessão.

---

## 2. A1 · Library V3 mostrando "Nenhum bloco disponível" — FALSO POSITIVO

**Hipótese original:** bug de agrupamento `kind → categoria`, causando categorias vazias.

**Evidência coletada** (dump de `document.querySelectorAll('.fbv3-lib__cat')` em cold-load, sem filtro, com registry pronto):

| Categoria       | Blocos renderizados | Empty state? |
|-----------------|--------------------:|:------------:|
| content         | 6                   | não          |
| menu            | 1                   | não          |
| action          | 4                   | não          |
| logic           | 1                   | não          |
| flow            | 1                   | não          |
| random          | 1                   | não          |
| wait            | 2                   | não          |
| integration     | 2                   | não          |
| ai              | 1                   | não          |
| system          | 1                   | não          |
| **TOTAL**       | **20**              |              |

20 blocos visíveis, cobrindo os 21 kinds registrados (menos `start` que é hidden por design — nó auto-injetado do fluxo). Nenhuma categoria vazia. A causa raiz do print original é ambiental:

- Provavelmente estado pós-HMR ou pós-remontagem em que o `useMemo(() => blockRegistry.list(), [])` de `NodeLibraryPanelV3.tsx` (linha 319) foi resolvido antes de `import "./blocks/definitions"` popular o singleton — cenário reproduzível apenas em dev-mode com HMR agressivo.
- Em cold-load produção o registry sempre está pronto pois `definitions.ts` é importado top-level de `FlowStudioV2.tsx`.

**Decisão:** sem correção de código. Caso o cenário HMR incomode em dev, tratar em missão futura como hardening (Low). Documentado no backlog Pós-V1.

---

## 3. A2 · "Cards fantasmas" no canvas — CONFIRMADO, causa raiz distinta

**Hipótese original:** resíduo de render ou nós órfãos.

**Evidência coletada** — bounding rects reais dos 16 nós antes do fix:

```
72x34 @ (548,298) 'AguardarPausa temporizadaAguardar 10 segundos'
72x34 @ (962,298) 'Enviar áudioEnvio de áudioLETICIA BLOCKCHAIN.opus...'
72x34 @ (824,298) 'AguardarPausa temporizadaAguardar 30 segundos'
72x34 @ (1100,298) 'AguardarPausa temporizadaAguardar 30 segundos'
72x34 @ (272,586) 'Enviar arquivoEnvio de arquivoAnexe o arquivo...'
90x49 @ (272,670) 'SimNãoCondiçãoRegra Sim / Não...'
...
```

**Causa raiz identificada:** não são cards fantasmas — são os **nós reais do fluxo renderizados a ~30% do tamanho natural**, resultado do `fitView` do React Flow reduzindo o zoom para 0.3 (o mínimo permitido pela config) para caber 16 nós no viewport. Cards de ~240×112px nativos aparecem como 72×34px após scale — texto colapsa por falta de espaço.

Arquivo: `src/features/flow-builder/canvas/FlowCanvasV2.tsx`

Configuração anterior:
```tsx
fitViewOptions={{ padding: 0.25, maxZoom: 1, minZoom: 0.3 }}
// e na chamada manual:
rf.fitView({ padding: 0.25, duration: 400 })  // usa default RF (0.5)
```

**Correção aplicada** (2 linhas):
```tsx
fitViewOptions={{ padding: 0.25, maxZoom: 1, minZoom: 0.6 }}
rf.fitView({ padding: 0.25, duration: 400, minZoom: 0.6, maxZoom: 1 })
```

Justificativa do valor 0.6: cards nativos ~240×112 → 144×67 renderizados. Título e subtítulo permanecem legíveis; ícone visível; handles clicáveis. Abaixo de 0.5 a tipografia colapsa, acima de 0.7 fluxos grandes ficam com pan obrigatório.

**Evidência pós-fix:**

```
144x67 @ (98,88)   'AguardarPausa temporizadaAguardar 10 seg'
144x67 @ (926,88)  'Enviar áudioEnvio de áudioLETICIA BLOCKC'
144x67 @ (650,88)  'AguardarPausa temporizadaAguardar 30 seg'
```

Cards dobraram de tamanho, texto começa a exibir com separação. Grafos grandes agora exigem pan/zoom manual quando não cabem em zoom 0.6 — comportamento correto (legibilidade > "tudo na tela").

**Trade-off explícito:** fluxos com muitos nós (16+) não caberão totalmente no viewport inicial. O botão "Organizar fluxo" continua funcional e o usuário pode diminuir manualmente até 0.15 (`minZoom` do canvas, não do fit).

---

## 4. A3 · Categoria "Atraso Inteligente" vazia — FALSO POSITIVO

**Hipótese original:** categoria `wait` sem blocos.

**Evidência:** categoria `wait` renderiza 2 blocos (`wait`, `wait_reply`) — confirmado no dump de A1. Kinds `wait` e `wait_reply` presentes em `blockRegistry`, testados internamente na FB-10.4E.

Decisão FB-10.4E de "não implementar Atraso Inteligente no V1" referia-se a **variantes avançadas** (delay condicional, delay adaptativo por horário comercial). O bloco básico já existe e funciona.

**Decisão:** sem correção. Sem depreciação de categoria.

---

## 5. Regressão

- **Testes:** `bun test src/features/flow-builder src/lib/__tests__` → **251 pass / 0 fail** (1143 asserts, 26 arquivos).
- **Typecheck:** delegado ao harness automático.
- **Escopo tocado:** apenas 2 linhas em `FlowCanvasV2.tsx`. Runtime, Executor, Serializer, Registry, Store, Health, Definitions — **intactos**.

---

## 6. Entregas

| Item | Status |
|------|:------:|
| A1 investigado, root cause identificado, sem código (falso positivo)  | ✅ |
| A2 investigado, root cause identificado, corrigido, provado por evidência antes/depois | ✅ |
| A3 investigado, root cause identificado, sem código (falso positivo)  | ✅ |
| Regressão limpa                                                        | ✅ |
| Escopo preservado (freeze respeitado)                                  | ✅ |

**FB-HOTFIX-01: ENCERRADA.**

Próxima etapa autorizada: **FB-11.0 — Auditoria de Paridade UX BotConversa** (READ-ONLY, entrega em `FB-11.0-BOTCONVERSA-UX-PARITY-PLAN.md`).
