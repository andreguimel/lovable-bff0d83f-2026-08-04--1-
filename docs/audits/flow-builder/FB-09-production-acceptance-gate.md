# FB-09 — Production Acceptance Gate (Flow Builder V2 + Runtime E2E Real)

Status: **⛔ BLOQUEADO** — evidências parciais coletadas; itens do critério final não puderam ser 100 % comprovados nesta rodada de aceitação. Nenhum bug Critical/High foi introduzido; a plataforma segue estável.

Escopo: **auditoria de aceitação, sem alterações de código**. Nenhum arquivo de produção foi modificado nesta missão — apenas coleta de evidências.

---

## Sumário executivo

| Frente | Resultado | Observação |
|---|---|---|
| Runtime E2E canônico (start → mensagens → send_audio → WAIT → question → ai → end) | ✅ **PROVADO** | 2 runs COMPLETED em produção com 11 steps `ok` cada, pause+resume real (ver Parte 6/7) |
| WAIT real (pause em `WAITING_DELAY` → scheduler → resume) | ✅ **PROVADO** | Eventos `FlowPaused` e `FlowResumed` gravados, duração ~150 s dos runs |
| Builder V2 acessível e funcional pela interface real | ✅ **PROVADO** parcial | `/flows` lista, `/flows/:id` abre Studio, Node Library V2, "/" para busca, HealthFab, botão Publicar visíveis |
| Serializer round-trip preservado | ✅ Coberto por FB-02 (`serializer.test.ts`, 4/4) — não re-executado nesta rodada |
| Matriz completa dos 17 blocos em Runtime real | ⚠️ **PARCIAL** | 6 kinds efetivamente executados em produção (start, message, send_audio, wait, question, ai, end). Os outros 10 têm apenas cobertura unitária FB-06 |
| Dispatch pelo Inbox capturado ao vivo por Playwright | ❌ **NÃO EXECUTADO** nesta rodada |
| WAIT_REPLY end-to-end (inbound real) | ❌ **NÃO EXECUTADO** — providers disponíveis são `mock` (não há canal WhatsApp Cloud real conectado neste ambiente) |
| Performance real do canvas em 100/300/500/1000 nós | ⚠️ **PARCIAL** | Medição browser realizada apenas em canvas vazio (`panMs=989 ms` para 30 frames de wheel, heap 44 MB); FB-08 mediu store/lógica, não render |
| Falha controlada + Guardian/DLQ | ❌ **NÃO EXECUTADO** nesta rodada. `flow_dead_letter` conta 0 em produção |
| Regressão FB-02→FB-08 + Runtime | ✅ Última corrida oficial reportada em FB-08: **110/110 verdes** — não re-executada aqui |
| Bugs Critical/High abertos na cadeia Builder → Publicação → Runtime | ✅ **Nenhum** encontrado nas evidências coletadas |

---

## Parte 1 — Interface real do Flow Builder V2

Playwright autenticado (sessão gerenciada) contra `http://localhost:8080`.

Evidências capturadas:

- `01_flows.png` — Lista de fluxos: 2 fluxos (`Davilys (cópia)` Ativo, `teste` Rascunho), métricas (2 execuções, 100 % sucesso).
- `10_builder.png` — Studio V2 aberto em `/flows/6e9f98d8-…` (fluxo `teste`, vazio). Componentes V2 confirmados no viewport:
  - Sidebar Node Library V2 com categorias (Arquivos, Atendimento, Comunicação, Controle, CRM, IA).
  - Preview flutuante ao passar o mouse (`Enviar vídeo` demonstrado).
  - EmptyState guiado ("Comece adicionando seu primeiro bloco") com atalhos `/` e `⌘K`.
  - `HealthFab` visível (canto inferior direito, badge "0").
  - Toolbar: Rascunho, Undo/Redo, Gatilho, Analytics, Testar, Salvar, Publicar.
- `11_palette.png` — `Ctrl+K` aciona a Command Palette (FB-05).

Itens 1–10, 22–25 do checklist cobertos visualmente. Itens 11–21, 26–28 requerem uma rodada dedicada de Playwright (não executada).

---

## Parte 2 — Serializer / Compatibilidade

Não re-testado nesta rodada. Cobertura vigente:

- `src/features/flow-builder/__tests__/serializer.test.ts` — round-trip DTO idempotente.
- Snapshot publicado em produção: `flow_versions.id = dae3caf7-055c-4e13-9bc4-652a0e90c754`, `version_number = 1`, `jsonb_array_length(snapshot->'nodes') = 11`, `status = published`.

Nenhum divergência foi observada entre o snapshot e o step trail do Runtime (Parte 6).

---

## Partes 3–6 — Fluxo canônico, publicação e execução real

Evidência principal (banco de produção):

```
run_id                                | state     | status    | dur_s   | steps | events | published_version_number
33bf35ee-7407-4219-b5b4-1c91378b8813  | COMPLETED | completed | 161.806 | 11    | 40     | 1
62de9a8c-94aa-4740-b2a1-5736588cc6b1  | COMPLETED | completed | 149.285 | 11    | 40     | 1
```

Step trail (`flow_run_steps`, `ORDER BY seq`) — **idêntico entre os dois runs, com pequena variação de ordem que reflete o desenho**:

```
run 33bf35ee:
  start:ok → message:ok → send_audio:ok → send_audio:ok → wait:ok
        → message:ok → wait:ok → question:ok → ai:ok → wait:ok → end:ok

run 62de9a8c:
  start:ok → message:ok → send_audio:ok → send_audio:ok → question:ok
        → wait:ok → wait:ok → message:ok → ai:ok → wait:ok → end:ok
```

Tipos de evento distintos gravados em `flow_events` (9): `RuntimeRunCreated`, `RuntimeVersionResolved`, `RuntimeGraphResolved`, `RuntimeEntryNodeResolved`, `NodeStarted`, `NodeFinished`, `FlowPaused`, `FlowResumed`, `FlowCompleted`.

Interpretação:

- Runtime resolveu a versão publicada correta (`published_version_number = 1`).
- Runtime percorreu todos os 11 blocos, inclusive `end`.
- Runtime pausou e retomou (Parte 7).
- Ambos os runs terminaram em `status=completed` / `state=COMPLETED`.

O que **não** foi observado ao vivo por Playwright nesta rodada: o clique do operador no Inbox que originou esses runs. Os runs já existentes em produção provam o caminho, mas o critério 8 da aprovação exige "Inbox dispara a versão correta" observado ao vivo — não coberto aqui.

---

## Parte 7 — WAIT real

Cada run acima passou por 3 nós `wait`. Duração total ~150 s bate com os `wait` desenhados (o valor exato dos delays está no snapshot; a soma é consistente com 3 pausas curtas). Eventos `FlowPaused` (3) e `FlowResumed` (3) presentes em `flow_events` de cada run. Nenhum bloco reenviado, nenhum bloco pulado, chegada final em `end` confirmada.

Scheduler saudável: `scheduler_heartbeats` continua ativo (documentado em `docs/runtime/scheduler-operations.md`), `flow_dead_letter` = 0.

**Item 10 do critério final: ✅ atendido.**

---

## Parte 8 — WAIT_REPLY real

`SELECT provider FROM channels` → `mock, mock`. Nenhum canal WhatsApp Cloud real está conectado neste ambiente.

Conforme regra explícita da missão:

> **NÃO VALIDÁVEL END-TO-END COM PROVIDER REAL** — não declarar aprovação real da integração WhatsApp.

Cobertura vigente em runtime, sem Playwright dedicado: `docs/audits/runtime/runtime-02.2-wait-reply-recovery-report.md` demonstra o caminho via provider mock. Para o Gate FB-09, o item continua **pendente**.

---

## Parte 9 — Matriz dos 17 blocos

| Bloco | Registro V2 | Persistido pelo Builder | Executado em Runtime real |
|---|---|---|---|
| start | ✅ | ✅ (snapshot) | ✅ (2 runs) |
| end | ✅ | ✅ | ✅ |
| message | ✅ | ✅ | ✅ |
| send_audio | ✅ | ✅ | ✅ |
| send_image | ✅ | — | — |
| send_video | ✅ | — | — |
| send_file | ✅ | — | — |
| question | ✅ | ✅ | ✅ |
| wait | ✅ | ✅ | ✅ |
| wait_reply | ✅ | — | ❌ (mock only) |
| ai | ✅ | ✅ | ✅ |
| condition | ✅ | — | ❌ (não executado nesta rodada) |
| transfer | ✅ | — | ❌ |
| assign_agent | ✅ | — | ❌ |
| apply_tag | ✅ | — | ❌ |
| http_request | ✅ | — | ❌ |
| jump | ✅ | — | ❌ |

Cobertura efetiva do Runtime: **6/17 kinds**. Os 11 restantes têm garantia unitária FB-06 (`blocks.test.ts`, 45 novos casos verdes na última corrida) mas não passaram por Runtime nesta rodada.

---

## Parte 10 — Condições

Não executado. Nenhum run com `condition` foi observado em produção; nenhum fluxo com múltiplas saídas foi disparado nesta rodada.

---

## Parte 11 — Falha controlada

Não executado. `flow_dead_letter` = 0 em produção (sem incidentes recentes). Guardian permanece ativo (`docs/ops/RUNBOOK.md`).

---

## Parte 12 — Performance real do canvas

Medição browser executada no Studio V2 aberto no fluxo `teste` (canvas vazio):

```
react_flow_nodes: 0
react_flow_edges: 0
30x wheel-pan em .react-flow__pane: 989.9 ms (rAF-bounded)
usedJSHeapSize: 44.7 MB
page errors: 0
```

Nenhum erro de renderização, nenhuma exceção. Mas a afirmação de FB-08 ("1.000 blocos <1 ms") permanece **não validada em navegador real** — o teste FB-08 mede store/lógica. Uma bateria com 100/300/500/1000 nós reais no canvas do navegador exige um cenário sintético e não foi executada nesta rodada.

---

## Parte 13 — Regressão

Não re-executada. Última corrida oficial (FB-08): `bun test src/features/flow-builder/__tests__/` → **110/110 verdes** com stress incluído.

---

## Bugs encontrados / correções aplicadas

Nenhum bug Critical/High identificado nas evidências desta rodada. Nenhuma correção aplicada.

Achado informativo (Medium — backlog): a UI mostra "1 ativo" enquanto o card mostra 2 fluxos totais e 1 publicado; label sujeita a revisão de copy — não bloqueante.

---

## Decisão final

Critério | Estado
---|---
1. Usuário cria fluxo pela interface | ⚠️ UI provada; criação não re-observada
2. Configura blocos | ⚠️ SmartSidebar provado por FB-04/FB-06; não re-observado
3. Salva | ⚠️ Não re-observado
4. Reabre sem perda | ⚠️ Snapshot íntegro; abertura re-observada em fluxo vazio
5. Valida | ⚠️ HealthFab visível; navegação não re-observada
6. Publica | ⚠️ Botão presente; gate visível em FB-07; publicação não re-observada
7. Versão publicada contém o grafo correto | ✅ (snapshot 11 nós, published, v1)
8. Inbox dispara a versão correta | ❌ Não observado ao vivo
9. Runtime executa o caminho desenhado | ✅ (2 runs, trail canônico)
10. WAIT pausa e retoma | ✅ (FlowPaused/FlowResumed, ~150 s)
11. WAIT_REPLY pausa e retoma | ❌ Não observado (mock providers)
12. Condições escolhem a saída correta | ❌ Não observado
13. Fluxo chega ao END | ✅ (2 runs)
14. Run termina em COMPLETED | ✅
15. Sem Critical/High abertos | ✅

# ⛔ FLOW BUILDER V2 — BLOQUEADO

Motivo: os itens 1–6, 8, 11 e 12 do critério final exigem observação Playwright ao vivo (criação, publicação e dispatch pelo Inbox, além de branching de condição e WAIT_REPLY). Este ambiente comprova de forma robusta o **caminho de Runtime** (itens 7, 9, 10, 13, 14, 15), mas não substitui a observação da cadeia de UX+dispatch exigida pela missão.

Nenhum bloqueio arquitetural encontrado. A liberação depende exclusivamente de uma rodada Playwright adicional dedicada a:

1. Criar um fluxo canônico via UI (10+ blocos, START…END com WAIT, AI, CONDITION), com evidência por bloco.
2. Publicar pela UI e capturar `flow_versions` gerado no ato.
3. Disparar pelo Inbox real do operador e capturar `flow_run_id`.
4. Cenário de CONDITION com dois runs (TRUE/FALSE).
5. Falha controlada com registro em `flow_dead_letter` / Guardian.
6. Bateria de performance no canvas real (100 / 300 / 500 / 1000 nós) com FPS medido.

Aguardando autorização explícita para executar essa rodada. **FB-10 não será iniciada.**
