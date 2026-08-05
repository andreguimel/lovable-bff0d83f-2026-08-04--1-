# CRITICAL-01 — Runtime de Fluxos + Scroll do Inbox

Status: **Encerrada**
Data: 2026-07-17
Escopo aprovado: `.lovable/plan.md`

Congelamento arquitetural mantido: nenhuma mudança em RLS, RBAC, Providers, Event Bus, State Machine do Runtime, ou Design System global. Todas as correções são pontuais na camada de aplicação + 1 migration corretiva de dados.

---

## P1 — "Ativo" x "publicado" (Crítico) ✅

### Evidência da causa raiz

```sql
SELECT f.id, f.name, f.status,
  (SELECT count(*) FROM flow_versions v
   WHERE v.flow_id=f.id AND v.status='published') AS published_count
FROM flows f ORDER BY created_at DESC;
```

Antes:
```
Davilys | status=active | published_count=0 | total_versions=0
```

O fluxo aparecia como Ativo na UI (`flows.status='active'`) e o Runtime recusava a execução porque `flow_versions` não tinha nenhuma linha com `status='published'`. Duas fontes de verdade completamente desacopladas — o botão "Ativar" nem sequer chamava `createFlowVersion`.

### Correções (causa, não sintoma)

1. **`src/lib/flows.functions.ts` — `setFlowStatus`**: mudar para `active` agora exige (a) pelo menos uma mensagem com conteúdo (validação pré-existente), (b) pelo menos uma `flow_versions.status='published'`, (c) grafo sem nós-folha órfãos (ver P2).
2. **`src/lib/flows.functions.ts` — `createFlowVersion`**: quando `publish=true`, promove `flows.status='active'` na mesma server function (exceto se estava `archived`). Elimina o descompasso pela raiz.
3. **`src/lib/flow-executor.server.ts` — `startFlow`**: mensagem de erro passou a citar o estado real observado quando o fluxo está `active` mas sem versão publicada, protegendo runs contra dados legados residuais.
4. **Migration `20260717_021722` (corretiva de dados)**: `UPDATE flows SET status='draft' WHERE status='active' AND NOT EXISTS (SELECT 1 FROM flow_versions v WHERE v.flow_id=flows.id AND v.status='published')`. Executada — 1 linha afetada (Davilys).

### Verificação

```sql
SELECT count(*) AS bad_flows FROM flows f
WHERE status='active'
  AND NOT EXISTS (SELECT 1 FROM flow_versions v WHERE v.flow_id=f.id AND v.status='published');
-- bad_flows = 0
```

Invariante atendido no presente e travado por código para o futuro.

---

## P2 — Execução para antes do último nó (Crítico) ✅

### Evidência

Todos os 12 runs mais recentes do Davilys terminaram com `state='COMPLETED'`, `status='completed'`, `error=NULL`, `messages_sent` entre 0 e 5. Passos gravados em `flow_run_steps`:

```
start → message → send_audio → wait → send_audio → message → message → ai → (fim)
```

### Grafo real (`flow_nodes` + `flow_edges`)

```
start (a30d90) → message (c43a20)
message (c43a20) → send_audio (059e26)
send_audio (059e26) → wait (9f31ed)
wait (9f31ed) → send_audio (0b672c)
send_audio (0b672c) → message (8a8b59)
message (8a8b59) → message (5a5f06)
message (5a5f06) → ai (bc0f59)
ai (bc0f59) → ∅          ← nó folha, não é `end`, sem edge de saída
```

### Causa raiz

O runtime está **tecnicamente correto**: no loop principal (`flow-executor.server.ts:1013-1028`), quando um nó não é `end` e `!cursor` (nenhuma edge de saída), ele encerrava a run silenciosamente como `COMPLETED`. Nenhuma exceção, timeout, promise perdida, retry infinito, race condition ou scheduler ausente. `flow_dead_letter` vazio. Nenhum job perdido.

O bug é **autoral**: o grafo tem um nó `ai` como folha e nenhum `end`. Sem trava na publicação, esse grafo entrou em produção e o operador não tinha como saber onde a execução parava.

### Correções (causa, não sintoma)

1. **`src/lib/flow-executor.server.ts` — `validateGraphForPublish` (novo)**: além das checagens de `validateGraph`, rejeita grafos em que existe qualquer nó não-`end` sem edge de saída. Mensagem explícita: `Nó(s) sem próximo passo: <tipo> "<label>". Conecte ao próximo nó ou finalize com um nó "Fim".`
2. **`src/lib/flows.functions.ts` — `createFlowVersion({publish:true})`**: aplica `validateGraphForPublish` antes de gravar `status='published'`. Publicação de grafo defeituoso passa a falhar com mensagem clara.
3. **`src/lib/flows.functions.ts` — `setFlowStatus('active')`**: aplica a mesma validação, para não deixar um fluxo pular direto para Ativo com grafo incompleto.
4. **`src/lib/flow-executor.server.ts` — loop principal**: quando ainda assim uma run terminar via `!cursor` (dados legados), grava `error` explicativo (`Fluxo terminou no nó <tipo> sem passar por um nó "Fim"...`) e emite evento distinto `FlowCompletedWithoutEnd` no `flow_events`. Estado continua `COMPLETED` para compatibilidade retroativa, mas o sinal fica visível para auditoria.

### Verificação

- Typecheck: `bunx tsgo --noEmit` = 0 erros.
- Grafo do Davilys: para republicar, o operador terá que conectar o nó `ai` a um próximo passo ou a um nó `Fim` — do contrário `createFlowVersion({publish:true})` falha com a mensagem descritiva.
- Runs legadas seguem completando (compatibilidade), mas com `error` populado e evento `FlowCompletedWithoutEnd` no bus.

Nenhuma alteração em State Machine, Event Bus, Publish Lock, Scheduler, Retry, Wait Reply, Delay, Queue ou Lock RPCs.

---

## P3 — Inbox abrir sempre na última mensagem (Alta UX) ✅

### Causa raiz

`src/routes/_authenticated.inbox.$conversationId.tsx:171-174` (antes):
```ts
useLayoutEffect(() => {
  if (!nearBottomRef.current) return;
  scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
}, [messages.length]);
```

Três problemas encadeados:
- `behavior:"smooth"` no primeiro paint gera scroll animado ("abre no topo e desce").
- `scrollHeight` no useLayoutEffect é medido ANTES de imagens/áudios carregarem — depois que o navegador dimensiona a mídia, `scrollTop` fica muito longe do fim.
- Nenhum reset ao trocar `conversationId`.

O handler `load` capture-phase também não é suficiente porque players de áudio/vídeo customizados (shadcn/etc.) não emitem `load` bubble.

### Correção

Substituição por três efeitos coordenados no mesmo componente:

1. `useLayoutEffect([conversationId])`: reseta `nearBottomRef=true` e ancora no fim (`scrollTop=scrollHeight`) sem animação.
2. `useLayoutEffect([messages.length])`: `scrollTo({behavior:"auto"})` quando `nearBottomRef.current` for `true` — instantâneo, sem "flutter" de animação no mount.
3. `useEffect([conversationId, messages.length])` com `ResizeObserver`: observa o container + filhos diretos e reancora sempre que `scrollHeight` mudar — cobre carregamento assíncrono de imagens, áudios, vídeos, transcrições e realtime. Regra: só reancora se o usuário estava perto do fim; se rolou para cima, o botão "descer" existente continua sendo a única forma de voltar.

O `scrollRef` é compartilhado entre desktop (linha 875) e mobile (linha 441) — a mesma correção vale para os dois.

### Evidência (Playwright autenticado)

Antes:
```
scrollTop: 0, scrollHeight: 79244, distFromBottom: 77688   (abriu no topo)
```
Depois:
```
scrollTop: 79420, scrollHeight: 81054, distFromBottom: 90   (ancorado no fim)
```

Screenshot final: `/tmp/browser/critical01/3_direct.png` — última mensagem visível junto ao composer no primeiro paint.

---

## Arquivos alterados

- `supabase/migrations/20260717_021722_*.sql` — migration corretiva de dados (fluxos `active` sem versão publicada → `draft`).
- `src/lib/flow-executor.server.ts` — nova função exportada `validateGraphForPublish`, mensagem de erro do `startFlow` diferenciando estado, sinal `FlowCompletedWithoutEnd` na saída silenciosa do loop.
- `src/lib/flows.functions.ts` — `setFlowStatus` exige versão publicada + grafo válido para publish; `createFlowVersion({publish:true})` valida grafo e promove `flows.status='active'`.
- `src/routes/_authenticated.inbox.$conversationId.tsx` — scroll: reset por `conversationId`, scroll não animado, `ResizeObserver` para reancoragem em carregamento de mídia.
- `docs/audits/inbox/CRITICAL-01-runtime-inbox-report.md` — este relatório.

## Validação

- `bunx tsgo --noEmit` — sem erros.
- Query pós-fix: 0 fluxos em estado inconsistente.
- Playwright autenticado (desktop 1280×1800): `distFromBottom=90` (< 120 = ancorado no fim).
- Regras de invariante travadas no código (não só em migration): estados inconsistentes deixam de ser criáveis via UI.

## Escopo NÃO tocado (conforme diretriz do produto)

- Grupo A do INBOX-UX-01 — permanece pausado até nova autorização.
- Runtime State Machine, Publish Lock, Event Bus, Scheduler, Retry, Wait Reply/Delay, Lock RPCs — inalterados.
- Providers, RLS, RBAC, Design System global, schema de `flow_runs`/`flow_versions`/`flow_run_steps`/`flow_events` — inalterados.

## Decisão

**Encerrada.** As três causas raiz foram identificadas com evidência empírica (dados reais no banco + trace de execução + medição no browser), corrigidas na origem, e as regressões estão travadas por código (não por convenção). O grafo do Davilys precisará ser republicado após conectar o nó `ai` ao próximo passo — a UI de publicação agora bloqueará explicitamente essa condição em vez de deixá-la passar silenciosa.
