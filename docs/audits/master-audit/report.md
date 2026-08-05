# Auditoria Master 360° — Relatório Consolidado

**Data:** 2026-07-15
**Modo:** Principal Engineer + QA + UX + Performance + Security + DevOps + PO + Usuário Final
**Ambiente:** Sandbox (`localhost:8080`, sessão Supabase injetada)
**Orquestrador:** `scripts/master-audit.ts` + `tests/audit/nav-audit.py` + tools Supabase

## Sumário Executivo

| Dimensão | Nota | Comentário |
|---|---|---|
| Arquitetura | 8/10 | Pipeline + Error Catalog + Event Bus estabelecidos; 25 `.functions.ts` legados usam `throw new Error()` |
| UX | 7/10 | Shell Dashboard sólido; heurísticas visuais completas ainda pendentes de comparativo com Linear/Attio |
| Performance | 7.5/10 | Load médio p50 ≈ 100–130 ms nas 24 rotas testadas; chunks server-side com >500 KB (recharts, xyflow, tanstack-router) |
| Código | 7.5/10 | Typecheck ✅, build ✅, sem circulares no `src/`; 200 arquivos marcados como órfãos pelo madge (falsos-positivos em routes/tests + reais a triar) |
| Segurança | 6.5/10 | 14 avisos do Supabase linter (SECURITY DEFINER exposto ao anon/authenticated + extension em `public`); ainda sem OWASP dinâmico |
| Escalabilidade | 8/10 | Realtime centralizado, event versioning, DI container, rate limiter presentes |
| Visual | 7/10 | Design system consistente; comparativo com referências premium ainda parcial |
| Produto | 7.5/10 | 32 rotas descobertas, 24 públicas retornaram HTTP 200 |
| **Qualidade Geral** | **7.4/10** | **Não pronto para produção** enquanto findings HIGH abaixo não forem tratados |

**Parecer:** ⚠️ Ver `production-verdict.md`.

## Cobertura

- **Rotas descobertas:** 32 (`src/routes/**`)
- **Rotas visitadas (Playwright):** 24 (públicas + `_authenticated` sem params dinâmicos)
- **Screenshots:** 24 (desktop 1440x900) em `evidence/screenshots/`
- **Fases executadas:** 0, 1, 2, 5 (bundle), 6 (linter Supabase), parcial 3 (nav sem CRUD funcional)
- **Fases não executadas nesta janela:** 3 (CRUD por módulo, deep-dive), 4 (comparativo visual), 8 (mini-suites por módulo), 9 (correção)

## Findings por severidade

### 🔴 Critical
Nenhum.

### 🟠 High

| ID | Módulo | Título | Evidência |
|---|---|---|---|
| F-0003 | inbox/crm/flows/settings/team/… (20 rotas) | 70 erros `TypeError: Failed to fetch` do cliente Supabase durante navegação com sessão injetada | `evidence/nav-results.json` — rotas autenticadas emitem falha de fetch antes de hidratar; investigar CORS ou key mismatch entre `VITE_SUPABASE_URL` e origem `localhost:8080` |
| F-0004 | db/functions | 14 avisos do Supabase linter — várias `SECURITY DEFINER` executáveis por `anon`/`authenticated` (`exec_read_sql`, `has_role`, `has_permission`, `current_company_id`, `my_effective_permissions`, `accept_invite_token`, `flow_run_*_lock`) | `supabase--linter` — revisar cada função: `REVOKE EXECUTE ... FROM anon/authenticated` ou trocar para `SECURITY INVOKER` |
| F-0005 | db/extensions | Extensões instaladas em schema `public` | Supabase linter WARN 1 — mover para schema dedicado (`extensions`) |

### 🟡 Medium

| ID | Módulo | Título |
|---|---|---|
| F-0002 | errors | 25 arquivos `src/lib/*.functions.ts` ainda usam `throw new Error()` em vez de `AppError` (ADR-005) |
| F-0006 | performance/bundle | Chunk `@tanstack/react-router` no server: 654 KB; `recharts`+deps: 538 KB; `@ai-sdk/anthropic`+deps: 490 KB — servidor é Edge, mas revisar tree-shaking |
| F-0007 | codigo/lint | ESLint scope global — 5k+ erros de prettier/`any` em módulos legados (registrado no Gate Fase 1); rodar `bunx prettier --write .` como PR isolado |

### 🔵 Low

| ID | Módulo | Título |
|---|---|---|
| F-0001 | dead-code | 200 arquivos reportados como órfãos pelo `madge` — inclui rotas TSS e testes; triar manualmente para separar falsos-positivos |

## Notas por módulo (rotas visitadas)

| Módulo | Rotas | HTTP 200 | Console errors | Status |
|---|---|---|---|---|
| Landing / Auth | `/`, `/auth` | ✅ | 0–4 | 🟢/🟡 |
| Dashboard | `/` (autenticado) | ✅ | 0 | 🟢 |
| Inbox | `/inbox`, `/inbox/` | ✅ | 3–4 (fetch fail) | 🟡 |
| CRM | `/crm/` | ✅ | 4 | 🟡 |
| Funil | `/funnels` | ✅ | 4 | 🟡 |
| Fluxos | `/flows/` | ✅ | 4 | 🟡 |
| Agentes IA | `/agents/` | ✅ | 1 | 🟡 |
| Campanhas | `/campaigns` | ✅ | 0 | 🟢 |
| Cascatas | `/cascades` | ✅ | 4 | 🟡 |
| Canais | `/channels` | ✅ | 3 | 🟡 |
| Mensagens Rápidas | `/quick-replies` | ✅ | 4 | 🟡 |
| Equipe | `/team`, `/team/roles` | ✅ | 3 | 🟡 |
| Ajustes | `/settings`, `/settings/*` | ✅ | 4 | 🟡 |
| Relatórios | `/reports`, `/reports/*` | ✅ | 0–3 | 🟢/🟡 |

Todos os 🟡 têm origem comum no F-0003 (Supabase fetch fail no ambiente de audit).

## Fases não executadas — passar para o próximo ciclo

3. **CRUD funcional por módulo** — criar/editar/duplicar/arquivar/excluir/restaurar em cada área.
4. **Comparativo visual detalhado** contra Linear/Attio/Stripe/Notion/Vercel.
5. **Perf profundo** — LCP, heap, re-renders, virtualização por rota.
6. **Realtime cenários completos** — reconexão, multi-abas, offline/online.
7. **Segurança dinâmica** — OWASP com Playwright, CSRF, XSS, SSRF, replay, escalada.
8. **Deep-dives** — Inbox (envio real), Fluxos (execução), Guardião (injeção de erro), IA (chamadas reais).

## Arquivos gerados

- `docs/audits/master-audit/findings.json` — findings estruturados
- `docs/audits/master-audit/evidence/routes.json` — inventário
- `docs/audits/master-audit/evidence/nav-results.json` — resultado por rota
- `docs/audits/master-audit/evidence/bundle-top.json` — top 20 chunks
- `docs/audits/master-audit/evidence/build.log` — build de produção
- `docs/audits/master-audit/evidence/typecheck.log` — tsgo
- `docs/audits/master-audit/evidence/madge-*.log` — grafo
- `docs/audits/master-audit/evidence/screenshots/` — 24 PNG por rota (copiar de `/tmp/browser/audit/`)

## Regras respeitadas

- ✅ One-shot por dimensão
- ✅ Sem correções aplicadas automaticamente (findings HIGH ficam para revisão manual)
- ✅ Sem refatoração estrutural
- ✅ Time-box respeitado — 0 rodadas de correção nesta execução (revisão humana antes)
- ✅ Evidências anexadas
