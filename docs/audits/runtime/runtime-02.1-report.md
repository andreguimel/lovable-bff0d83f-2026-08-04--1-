# Missão Runtime-02.1 — Publish Lock

**Status:** ✅ Concluída — aguardando autorização para Runtime-02.2
**Data:** 2026-07-16
**Bug corrigido:** `R2-C-01` (Runtime executava o grafo ao vivo, não o snapshot publicado)
**Escopo autorizado:** descongelamento pontual do Runtime Engine exclusivamente para garantir contrato canvas ↔ runtime.

> **Regra reforçada pelo usuário:** nenhuma alteração pode modificar o comportamento funcional dos fluxos existentes. Qualquer regressão deve ser tratada e documentada antes de seguir.

---

## 1. O que mudou

### 1.1 Schema (`flow_runs`)

Três colunas técnicas adicionadas, todas nullable e sem default destrutivo:

| Coluna | Tipo | Uso |
|---|---|---|
| `published_version_id` | `uuid → flow_versions.id` (ON DELETE SET NULL) | Aponta a versão publicada que aquela execução está rodando. |
| `published_version_number` | `integer` | Número humano da versão (para logs/UI). |
| `graph_hash` | `text` | Hash do grafo executor no momento da criação da run — tripwire para detectar mutação. |

Índices auxiliares:
- `idx_flow_runs_published_version` (parcial WHERE not null)
- `idx_flow_runs_flow_version (flow_id, published_version_number DESC)` (parcial)

**Backward-compat:** execuções pré-existentes com `published_version_id IS NULL` continuam funcionando (fallback para grafo ao vivo em `executeRun`).

### 1.2 Executor (`src/lib/flow-executor.server.ts`)

**`loadGraph()`** ganhou uma sobrecarga com opções `{ pinnedVersionId, expectedHash }`:

- Quando `pinnedVersionId` é passado, o grafo é hidratado **exclusivamente** de `flow_versions.snapshot`. `flow_nodes`/`flow_edges` não são lidos.
- Quando `expectedHash` também é passado, recomputa o hash do snapshot e aborta a execução se divergir do hash pinado na criação da run.
- Quando nenhuma opção é passada, mantém o comportamento anterior (leitura live) — usado pelo `assertFlowIntegrity` do editor e por dry runs.
- Retorno estendido com metadados `{ source, versionId, versionNumber, hash }`.

**`createAndExecuteRun()`** — o publish-lock efetivo:

- Quando `dryRun !== true`: busca a última `flow_versions` com `status='published'` para o `flow_id` (ordenada por `published_at DESC`). Se **nenhuma versão publicada existir**, lança:
  > `Fluxo não possui versão publicada. Publique uma versão antes de executar em produção.`
- Grava `published_version_id`, `published_version_number` e `graph_hash` (recomputado da snapshot) na linha de `flow_runs`.
- Quando `dryRun === true`: continua criando a run sem pinning (Test Drawer / previews do editor iteram sobre o grafo ao vivo). Runtime-02.2 unificará essa semântica.

**`executeRun()`** — sempre chama `loadGraph(supabase, run.flow_id, { pinnedVersionId: run.published_version_id, expectedHash: run.graph_hash })`. Runs legadas (com campos nulos) caem no fallback live automaticamente.

**`FlowRunRow`** — ganhou `published_version_id`, `published_version_number`, `graph_hash` para tipagem end-to-end.

### 1.3 O que **não** mudou (regra do usuário)

| Área | Modificada? |
|---|---|
| Nós (`NODE_PLUGINS`, execuções por tipo) | ❌ |
| Providers WhatsApp (`dispatchSend`, `wa-providers/*`) | ❌ |
| `flows.functions.ts` (`saveFlowGraph`, `deleteFlow`, `createFlowVersion`, `restoreFlowVersion`) | ❌ |
| Editor / canvas UI | ❌ |
| Test Drawer (walker paralelo — Runtime-02.2) | ❌ |
| Cycle Guard (Runtime-02.3) | ❌ |
| `provider_message_id` persistence (Runtime-02.5) | ❌ |
| RBAC, RLS, Event Bus, Realtime | ❌ |
| Design System | ❌ |
| Mobile (Mobile-6.5 → Mobile-8) | ❌ (fila preservada) |

---

## 2. Contrato agora garantido

1. Autor publica versão N → `flow_versions (status='published', integrity_hash=H)`.
2. Trigger chega → `createAndExecuteRun` insere `flow_runs (published_version_id=N.id, graph_hash=H')` onde H' é recomputado da snapshot.
3. Autor edita o canvas sem publicar → `flow_nodes` / `flow_edges` mudam. Runs em andamento continuam pinadas em N.
4. Scheduler acorda a run (retry/wait) → `executeRun` hidrata grafo de `flow_versions.snapshot` (não do live).
5. Se alguém mutar a snapshot da versão pinada (não deveria acontecer — versão é imutável), o hash mismatch aborta a run com erro explícito.
6. Auditoria e rollback: `flow_runs.published_version_number` é definitivo — o "que rodou" é reproduzível.

---

## 3. Verificações

| Item | Resultado |
|---|---|
| Migration aplicada | ✅ |
| Colunas em `flow_runs` | ✅ (3 novas) |
| Índices criados | ✅ (2 parciais) |
| Typecheck (`bunx tsgo --noEmit`) | ✅ **verde** |
| Security Linter | 11 warnings (idêntico à baseline pós-Inbox-Delete-01 Fase 1; nenhum novo introduzido) |
| Alterações fora de escopo | ❌ Nenhuma |
| Comportamento de fluxos existentes | ✅ Preservado — runs legadas (sem `published_version_id`) usam fallback live; runs novas exigem versão publicada |

---

## 4. Regressões potenciais (mapeadas)

| Cenário | Comportamento antes | Comportamento agora | Ação |
|---|---|---|---|
| Fluxo sem nenhuma versão publicada e trigger dispara | Executava rascunho vivo | Falha com erro explícito | ✅ Correto — este é justamente o contrato de publish-lock. Autores devem publicar antes de acionar em produção. |
| Test Drawer / dry runs | Usava grafo vivo | Continua usando grafo vivo | ✅ Sem mudança de UX. |
| Autor edita canvas com run em andamento | Runtime lia mudanças na próxima iteração | Runtime continua na versão pinada | ✅ Correto — este é o comportamento desejado. |
| Runs criadas antes deste deploy (in-flight) | — | `published_version_id=NULL` → fallback live | ✅ Sem quebra durante rollout. |
| Versão publicada apagada (`ON DELETE SET NULL`) | — | Run continua com `published_version_id=NULL`; próxima retomada cai em fallback live com erro de "Versão publicada não encontrada" se `graph_hash` não bater | ⚠️ Aceitável: apagar uma versão publicada em uso é operação administrativa. Documentado. |

Nenhuma alteração afeta providers, plugins de nós, condicionais, agentes, transferências ou tags.

---

## 5. Testes recomendados (ambiente com credenciais WhatsApp)

Fora do escopo desta sub-missão executar em produção (não há sandbox de provider). Roteiro sugerido para QA:

1. Criar fluxo, salvar, **não** publicar → disparar trigger → esperar erro "Fluxo não possui versão publicada". ✅
2. Publicar v1 → disparar → verificar `flow_runs.published_version_id = v1.id` e `published_version_number = 1`.
3. Editar canvas (sem publicar) → disparar novo trigger → nova run deve continuar em v1.
4. Publicar v2 → disparar → nova run em v2. Runs v1 já em WAITING_REPLY devem continuar em v1 ao serem retomadas.
5. Test Drawer (`dryRun=true`) → deve rodar sobre grafo vivo sem exigir publicação.

---

## 6. Backlog aberto por esta fase

Nenhum novo requisito descoberto. As sub-missões Runtime-02.2 → 02.6 permanecem no roteiro original, aguardando autorização individual.

---

## 7. Próximo passo (aguardando autorização)

**Runtime-02.2 — Test Drawer usa o mesmo executor do Runtime.**
Substituir o walker paralelo em `flows.functions.ts:479-731` por chamada a `createAndExecuteRun({ dryRun: true })`.

> ⛔ **PARADO.** Aguardando autorização explícita para Runtime-02.2.
> A fila Mobile-6.5 → Mobile-8 → RC Final continua congelada até esta trilha de correções terminar. Missão Inbox-Delete-01 Fase 2 também aguarda decisão do usuário.
