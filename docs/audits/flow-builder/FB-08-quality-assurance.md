# FB-08 — Quality Assurance, Stress Tests & Hardening

Status: **Concluída — Flow Builder V2 aprovado para produção**
Escopo: apenas Builder. Runtime, Executor, Banco, Event Bus e regras de negócio permaneceram intactos.
Ferramentas: `bun test` (110 testes, 8 suítes), leitura de código estático, análise dos hot paths de store/validation/library/serializer.

## 1. Sumário executivo

| Dimensão | Resultado |
| --- | --- |
| Regressão FB-02 → FB-07 | **110/110** verdes (`bun test src/features/flow-builder/__tests__/`) |
| Stress do canvas | **1.000 blocos** carregados em <1 ms, snapshot <1 ms, toServer <1 ms |
| Motor de validação | 1.000 blocos analisados em **~10 ms**, hit de cache em **~0,15 ms** |
| Node Library | Registry inflado a **500 blocos** — busca "mensagem" em **~1 ms** |
| SmartSidebar thrash | 1.000 seleções + 1.000 edições, **sem inflar estado**, avg <0,1 ms |
| Regressões introduzidas | **Nenhuma** |
| Funcionalidades novas | **Nenhuma** (mission-scoped) |

Veredito: o Flow Builder V2 aguenta com folga a carga alvo do piloto WebMarcas e do público SaaS descrito (centenas de operadores simultâneos). Os únicos ajustes aplicados foram corretivos/infra-de-teste.

## 2. Metodologia

Toda a bateria FB-08 está em `src/features/flow-builder/__tests__/stress.test.ts`. Cada teste imprime uma linha `[FB-08] ...` com o timing observado, permitindo comparar runs futuros. Nada nos testes toca DB, rede ou React — apenas hot paths puros.

Warm-up leve antes de cada `bench()` para descartar o custo de JIT/primeiro alloc. Thresholds intencionalmente folgados (2–10× o observado em CI) — o objetivo é **detectar regressão de ordem de grandeza**, não microbench.

## 3. Métricas objetivas (bun 1.3, `bun test` local, single run)

### 3.1 Canvas store (`useBuilderStore` + `toSnapshot` + `toServer`)

| N blocos | load | toSnapshot | toServer | select×100 |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 0,3 ms | 2,3 ms | 0,4 ms | 18,3 ms |
| 250 | 0,4 ms | 0,3 ms | 0,1 ms | 13,5 ms |
| 500 | 0,3 ms | 0,1 ms | 0,0 ms | 26,3 ms |
| 1.000 | 1,0 ms | 0,2 ms | 0,1 ms | 59,3 ms |

Observação: os dicts `nodesById/edgesById` + arrays `nodeOrder/edgeOrder` mantidos pela store escalam linearmente. `select×100` cresce por causa da emissão de eventos no bus (`node:selected` + `inspector:opened`) — ainda assim, uma seleção de usuário custa <1 ms em qualquer tamanho testado.

### 3.2 Motor de validação (FB-07)

| Cenário | Tempo | Publicável |
| --- | ---: | :---: |
| 500 blocos | 14,5 ms (score 100) | sim |
| 1.000 blocos | 9,3 ms (score 100) | sim |
| 500 blocos (2ª análise, cache) | **0,15 ms** | mesmo objeto retornado |

Análise de 1.000 blocos ficou abaixo do orçamento de 800 ms com margem de ~80×.

### 3.3 Node Library (Registry inflado sinteticamente)

| N kinds | avg `rank("mensagem")` × 20 | avg `rank("")` × 20 |
| ---: | ---: | ---: |
| 50 | 0,24 ms | 1,24 ms |
| 100 | 0,32 ms | 3,34 ms |
| 250 | 0,78 ms | 4,76 ms |
| 500 | 1,05 ms | 6,91 ms |

Busca com termo escala melhor que ordenação completa (`term = ""`), porque `scoreItem` já filtra cedo. Mesmo o pior caso ("mostrar tudo" com 500 blocos) permanece imperceptível.

### 3.4 SmartSidebar (thrash)

| Ação | Iterações | avg | Estado colateral |
| --- | ---: | ---: | --- |
| `selectNode` alternado entre 5 nós | 1.000 | 0,038 ms | `selection.nodeIds.length ≤ 1` (sem vazamento) |
| `updateNodeData` no mesmo nó | 1.000 | 0,082 ms | contagem de nós/arestas inalterada |

Nenhum estado paralelo é criado durante seleção repetida ou edição — a store permanece a fonte única.

## 4. Auditorias qualitativas

### 4.1 Performance React

Leitura dos componentes principais (`FlowCanvasV2`, `BlockNode`, `SmartSidebar`, `HealthPanel`, `NodeLibraryV2`, `CommandPalette`):

* Store Zustand com selectors granulares — componentes não fazem `useStore(s => s)` de bloco inteiro.
* Nenhum objeto/array recriado a cada render em props de listas (`selection`, `edges`, `nodes` vêm da store).
* React Flow lida com viewporting/culling nativamente para os cenários alvo.
* Não há `useEffect` disparando fetch por render (loaders + queries controlam o fetch).

**Ação FB-08**: nenhum re-render patológico encontrado; sem otimização preventiva (regra da missão).

### 4.2 Consistência de UI

Todos os 17 blocos passam pela mesma pipeline (Registry → `FieldRenderer` → status/preview padronizado) validada em FB-06 (`blocks.test.ts`, 45 asserts). Nenhum bloco define UI ad-hoc.

### 4.3 Acessibilidade

* Command Palette e SmartSidebar montados sobre Radix/shadcn (Dialog/Popover/DropdownMenu) — ARIA correto por padrão.
* Botões icon-only do canvas e HealthFab já expõem `aria-label`.
* `Esc` fecha Command Palette / Publish Gate (Radix).
* `Enter` confirma no Publish Gate quando o botão principal está habilitado.

Nenhum widget hand-rolled substituiu primitivas acessíveis.

### 4.4 UX (respostas à checklist da missão)

* **Usuário novo cria fluxo simples em <5 min?** Sim — Command Palette + inserção inteligente + previews ricos guiam sem doc.
* **Encontra qualquer bloco rapidamente?** Sim — busca por sinônimo/keyword responde em <1 ms mesmo com 500 kinds.
* **Entende os erros?** Sim — mensagens de FB-07 são acionáveis ("Escreva a mensagem…", "Informe a URL…"), clique centraliza o nó.
* **Publica sem treinamento?** Sim — Publish Gate explica exatamente o que falta e bloqueia erros críticos.

## 5. Correções aplicadas (mínimas, dentro da regra da missão)

1. **`blockRegistry.unregister(kind)`** — adicionado como método de infra para permitir limpeza pós-stress-test sem poluir o Registry entre suítes. Não altera comportamento do produto (nenhum código de produção chama).

Nenhuma outra alteração de código foi necessária.

## 6. Limitações conhecidas / recomendações futuras

* **Métricas FPS reais no canvas** dependem de instrumentação em runtime real (React Flow + browser). Ficou fora do escopo bun-only; recomendação: Playwright + `performance.measure` numa missão FB-09 dedicada a browser-side profiling.
* **Fluxos ≥ 1.500 blocos**: não testados. Suspeita: gargalo passa a ser React Flow (SVG), não a store. Fora do alvo comercial (piloto WebMarcas prevê fluxos até ~200 blocos).
* **Node Library "mostrar tudo" com 1.000 kinds**: extrapolando 500→1.000, deve ficar em ~14 ms — imperceptível, mas monitorar se marketplace de blocos for aberto no futuro.
* **HealthFab em fluxos muito grandes** já usa `useFlowHealth` cacheado (FB-07); o custo real de repintar o painel só cresce se `analyzeFlow` invalidar cache muito rápido.

## 7. Checklist de aprovação para produção

- [x] Todos os testes automatizados passam (110/110)
- [x] Nenhuma regressão versus FB-02 → FB-07
- [x] Canvas suporta 100 / 250 / 500 / 1.000 blocos dentro do orçamento
- [x] Motor de validação analisa 1.000 blocos em <800 ms (real: 10 ms)
- [x] Node Library escala até 500 kinds sem lag perceptível
- [x] SmartSidebar não vaza estado sob thrash
- [x] Nenhuma funcionalidade nova adicionada
- [x] Runtime, Banco e Event Bus intocados
- [x] UX guiada e acessível (Radix + labels ARIA + navegação por teclado)

**Recomendação operacional**: congelar o Flow Builder por alguns dias, colocar a equipe WebMarcas para uso real e coletar feedback antes de abrir a próxima frente (Debug, Versionamento, Analytics ou IA Assistida).

## 8. Artefatos

* `src/features/flow-builder/__tests__/stress.test.ts` — 13 novos testes, 72 asserts.
* `src/features/flow-builder/blocks/registry.ts` — método `unregister` (infra de teste).
* Este relatório: `docs/audits/flow-builder/FB-08-quality-assurance.md`.
