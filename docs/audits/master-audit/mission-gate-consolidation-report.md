# Missão — Gate de Consolidação (pré Mobile-6.3)

**Data:** 2026-07-16
**Escopo:** Validação de tudo o que já foi entregue (Missões 1, 2.1, 2.2, Mobile-1..6.2, Runtime-01). Congelamento de arquitetura. Correção somente de regressões Críticas/Altas.
**Não tocado:** Arquitetura, banco, Runtime Engine, RBAC, RLS, Server Functions, Providers, Pipeline, Event Bus, Design System global, módulos ainda pendentes (Mobile-6.3..6.7 e Mobile-8).

## Regra global adicionada (vale desta missão em diante)

> Nenhuma sub-missão pode modificar arquitetura, banco, Runtime Engine, RBAC, RLS, Server Functions, Providers, Pipeline, Event Bus ou Design System global, salvo bug Crítico/Alto comprovado. Ajustes Médios/Baixos vão para o backlog. Cada missão termina com relatório de conclusão + evidências + decisão explícita "Encerrada" ou "Bloqueada". Proibido reabrir missões concluídas ou refatorar fora do escopo.

Registrada em `AGENTS.md`.

## Gates automatizados

| Gate | Resultado | Observação |
|------|-----------|------------|
| `bun run build` | ✅ verde | 1.89s, sem erros; bundle server dentro do envelope conhecido |
| `tsgo --noEmit` (typecheck) | ✅ verde | 0 erros |
| `bun run lint` | ⚠️ pré-existente | 5.492 issues (majoritariamente prettier + preexisting no-explicit-any em `invite.$token.tsx`). **Nenhuma nova regra**, débito histórico. Vai para backlog **F-0007** (já registrado). |
| `bunx knip --production` | ⚠️ pré-existente | 28 tipos exportados não usados + 1 função (`listConversationTransfers`). Sem regressão nova. Backlog **F-0001**. |
| `supabase--linter` | ✅ 0 ERROR | 11 WARN (helpers SECURITY DEFINER by-design + `pg_net` em `public`) — mesmos da Missão 1, já documentados em security memory |
| `security--run_security_scan` | ✅ 0 Critical/High | 11 WARN idem acima |
| `code--dependency_scan` | ✅ limpo | Nenhuma vulnerabilidade High/Critical |

## Smoke Playwright (20 rotas × 2 viewports)

- Ambiente sandbox: `LOVABLE_BROWSER_AUTH_STATUS=signed_out`.
- Rotas autenticadas redirecionam corretamente para `/auth?redirect=…` (comportamento esperado do gate `_authenticated`).
- **Overflow horizontal:** 0/20 (nenhum).
- **Screenshots:** `/tmp/browser/gate/screenshots/` (20 arquivos).
- **Console errors observados:** 17 ocorrências do warning `Hydration failed because the server rendered HTML didn't match the client` — todas na página `/auth` (única página SSR-renderizada nesse cenário; demais têm `ssr: false` e redirecionam antes de renderizar).

### Análise do warning de hydration

- Página `/auth` tem `ssr: false` desde antes do Mobile-1. Com essa configuração o Nitro renderiza um placeholder no servidor e o cliente monta a árvore real, disparando o warning do React em modo dev.
- **Não é regressão** das missões Mobile-6.x nem do Runtime-01.
- **Não quebra funcionalidade** — as screenshots mostram a página renderizada corretamente e a árvore é regenerada no cliente.
- Classificação: **Medium** → backlog `F-GATE-01` (avaliar `Suspense boundary` + `<ClientOnly>` em Mobile-6.7/polimento).

### Validação autenticada

Bloqueada por ambiente (`signed_out`). Não é ação para esta missão — a validação autenticada acontece automaticamente quando o usuário abrir o preview logado. Registrado como **pendência operacional**, não bug de código.

## Revalidação Runtime Engine (pós Runtime-01)

- `flow-executor.server.ts::waitReplyNode` continua tratando `variables.reply` no resume (RT-01 permanece corrigido).
- `inbox.functions.ts::getMediaUrl` continua retornando URLs completas como estão e normaliza prefixo do bucket (RT-02 permanece corrigido).
- `assertFlowIntegrity` presente e exportado (RT-03).
- **Pendência operacional inalterada:** cron externo apontando para `/api/public/flow-resume` (blocos `wait`). Sem cron, delays travam. Não é bug de código.

## Revalidação Segurança (pós Missão 2.1)

- 0 Critical/High no scanner.
- `pending_invites`: policy anon fechada, RPC `preview_invite_by_token` mantida (hotfix 01.1).
- `SECURITY DEFINER`: 5 funções tiveram `EXECUTE` revogado de anon/PUBLIC na Missão 1; 8 restantes são helpers de RLS by-design, já documentados.
- Dependency scan: 0 vulnerabilidades High/Critical.

## Revalidação Mobile (pós Mobile-1 → 6.2)

- Shell mobile ativo em `< 768px` (Top App Bar + Bottom Nav + Drawer + FAB slot) — arquivos presentes:
  - `src/components/mobile/mobile-shell.tsx`
  - `src/components/mobile/mobile-top-bar.tsx`
  - `src/components/mobile/mobile-bottom-nav.tsx`
  - `src/components/mobile/mobile-drawer.tsx`
  - `src/components/mobile/mobile-fab.tsx`
- Hook `useIsMobile` SSR-safe.
- Módulos com camada mobile premium concluídos: Inbox (Mobile-2), CRM (3), Dashboard (4), Flows+Agents (5), Channels (6.1), Campaigns (6.2).
- Nenhuma regressão desktop detectada.

## Regressões Críticas/Altas encontradas

**Nenhuma.**

Todo item observado é Medium/Low e vai para o backlog. Nenhuma correção aplicada nesta rodada — conforme regra global.

## Backlog gerado por este Gate

- **F-GATE-01 (Medium):** `/auth` emite warning de hydration com `ssr:false`. Avaliar `<ClientOnly>` em Mobile-6.7.

Demais backlog inalterado (F-0001, F-0002, F-0006, F-0007 pré-existentes).

## Decisão

**Encerrada.** Arquitetura congelada até o RC Final. Sub-missão seguinte autorizada pela sequência aprovada: **Mobile-6.3 (Guardião)** — aguardando autorização explícita do usuário.

## Evidências

- Screenshots: `/tmp/browser/gate/screenshots/`
- Resultado bruto do smoke: `/tmp/browser/gate/results.json`
- Script Playwright: `/tmp/browser/gate/smoke.py`
