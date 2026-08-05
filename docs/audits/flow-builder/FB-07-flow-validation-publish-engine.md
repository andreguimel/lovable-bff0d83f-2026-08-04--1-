# FB-07 — Flow Validation & Publish Engine (Pré-Voo)

Status: **Concluída**  
Escopo: apenas Builder (Runtime, Executor, Banco e Schema intactos).

## Objetivo

Antes de publicar qualquer fluxo, responder objetivamente:
"Este fluxo está pronto para produção?" — sem que o usuário descubra o
problema em produção. Toda validação vive dentro do Builder e nunca
altera o grafo persistido.

## Entregas

| Item | Arquivo |
| --- | --- |
| Motor de análise + cache incremental | `src/features/flow-builder/validation/engine.ts` |
| Registry extensível de validadores | `src/features/flow-builder/validation/registry.ts` |
| Regras built-in (grafo + refs) | `src/features/flow-builder/validation/rules.ts` |
| Superfície pública (`useFlowHealth`, back-compat) | `src/features/flow-builder/validation/index.ts` |
| Painel "Saúde do Fluxo" + FAB | `src/features/flow-builder/panel/HealthPanel.tsx` |
| Publicação segura + relatório | `src/features/flow-builder/panel/PublishGate.tsx` |
| Wiring no Studio | `src/features/flow-builder/FlowStudioV2.tsx` |
| Testes automatizados | `src/features/flow-builder/__tests__/validation.test.ts` |

## Arquitetura

```
snapshot store ─► analyzeFlow ─► [ graphRules ] + [ per-node validate() ]
                                 + [ blockRules extensíveis ]
                                        │
                                        ▼
                     FlowHealthReport { errors, warnings, infos,
                                         score 0-100, metrics, canPublish }
```

* **Extensível**: qualquer módulo registra novas regras via
  `validatorRegistry.registerGraph()` ou `registerBlock()`. O engine
  consulta o registry a cada análise — nada muda em `engine.ts`.
* **Incremental / performática**: cache por chave-hash do snapshot
  (`nodes+edges+data`). Análise de fluxo com 122 blocos roda em
  <5 ms na máquina de CI (limite do teste: 200 ms).
* **Compatível**: usa apenas a store e o Registry V2. Nenhum kind,
  campo persistido ou schema foi alterado. Fluxos legados são
  analisados sem migração.

## Regras built-in

**Grafo**

* `graph:start` — fluxo vazio, sem Início, ou com múltiplos Inícios (erro).
* `graph:terminal` — nenhum bloco de término (warning).
* `graph:orphan` — bloco solto (sem conexões) (warning).
* `graph:unreachable` — bloco conectado mas não alcançado a partir do
  Início (warning).
* `graph:cycle` — DFS clássico detecta loops; reporta um único aviso
  por ciclo com contagem de blocos envolvidos.
* `graph:edges` — endpoint inexistente (erro), self-loop (warning),
  handle de origem inexistente (warning).
* `graph:branch-coverage` — bloco com múltiplas saídas mas nem todas
  conectadas (info).
* `graph:terminal-reachable` — existe término, mas nenhum caminho o
  atinge (warning).

**Referências cruzadas**

* `block:assign-agent-ref` — agente inexistente (erro) ou inativo
  (warning).
* `block:vars` — `{{prefix.path}}` fora do vocabulário conhecido
  (`contact`, `ai`, `last_reply`, …) vira uma dica.

**Por bloco**: cada bloco continua responsável pela própria validação
via `BlockDefinition.validate` — o engine consome esse resultado sem
duplicar regra.

## UX

* **FAB "Saúde"** no canto do canvas — cor do badge segue o estado
  (verde/âmbar/vermelho) e mostra o score.
* **Painel lateral flutuante** com resumo (score, erros, avisos,
  dicas) e lista clicável. Filtros por severidade.
* **Navegação em um clique**: centraliza o canvas no bloco
  (`useReactFlow().setCenter`), seleciona o nó (single source of truth
  na store) e o SmartSidebar abre automaticamente pelo fluxo já
  existente (`selection.nodeIds[0]`).

## Publicação segura

Fluxo do botão **Publicar**:

1. Sempre abre o `PublishGate` — nunca dispara publicação direta.
2. Gate reexecuta `analyzeFlow` com `force: true` (garante o snapshot
   atual mesmo se o cache estiver quente).
3. Estados:
   * **bloqueado** (há erros) — botão desabilitado; lista clicável.
   * **avisos** — exige checkbox "Estou ciente" antes de liberar.
   * **pronto** — libera imediatamente.
4. Ao concluir com sucesso, o mesmo dialog exibe o **relatório de
   publicação** com data/hora, blocos, conexões, score, contagem de
   avisos/erros/dicas e "Responsável" (arquitetura pronta — sem novo
   fluxo de auth). Última barreira: se `analyzeFlow` detectar erro no
   momento da confirmação, `publishMutation` não é disparado (defesa
   em profundidade).

## Testes

`bun test src/features/flow-builder/__tests__/` → **97 pass / 0 fail**
(15 novos em `validation.test.ts`).

Cenários cobertos:

* fluxo perfeito;
* fluxo vazio, sem início, com múltiplos inícios;
* blocos incompletos (mensagem vazia → erro acionável);
* conexão para bloco inexistente;
* ramos inacessíveis e órfãos;
* ciclos;
* referência a agente inexistente;
* fluxo grande (122 blocos) em <200 ms;
* cache incremental devolve o mesmo objeto para snapshots idênticos;
* `issue.nodeId` sempre aponta para nó existente (garante navegação);
* registro dinâmico de nova regra sem tocar no engine;
* fluxo legado (`wait_reply`, etc.) analisado sem migração.

## Checklist de qualidade

* O usuário entende exatamente por que não pode publicar? **Sim** —
  título curto + detalhe acionável em cada issue.
* Cada erro leva diretamente ao ponto? **Sim** — clique centraliza o
  canvas, seleciona e abre o painel do bloco (`path` também é
  propagado para foco futuro do SmartSidebar).
* Evita falsos positivos? **Sim** — checks estruturais são exatos;
  ambiguidades (variáveis, cobertura de saídas) ficam em severidade
  `info`, nunca `error`.
* Extensível sem retrabalho? **Sim** — registrar `GraphRule`/`BlockRule`
  é a única superfície necessária.

## Fora do escopo (intencional)

Debug em runtime, comentários, versionamento visual, analytics —
todos ficam para as próximas missões, agora que a base de confiança
está entregue.
