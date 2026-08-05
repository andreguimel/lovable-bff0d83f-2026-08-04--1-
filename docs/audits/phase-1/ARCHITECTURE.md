# ARCHITECTURE.md

## Estado atual

**Stack:** TanStack Start v1 + React 19 + Vite 7 + Tailwind v4, deploy Cloudflare Worker (edge), backend Lovable Cloud (Supabase gerenciado).

**Camadas:**

```
src/
├── routes/                # File-based routing TSR (33 arquivos)
│   ├── __root.tsx         # Shell HTML, providers
│   ├── _authenticated.*   # Layout com gate de auth
│   ├── auth.tsx           # Login/signup
│   ├── invite.$token.tsx  # Aceite de convite
│   └── api/public/*       # 9 endpoints HTTP (webhooks, cron, health)
├── lib/                   # Domínio + integrações
│   ├── *.functions.ts     # 28 módulos de server functions (RPC)
│   ├── *.server.ts        # 19 módulos server-only (nunca no bundle client)
│   ├── events/            # Registry de eventos (append-only)
│   ├── pipeline/          # execute.ts — orquestração
│   ├── rbac/              # guard.ts + registry.ts
│   ├── realtime/          # Wrappers de subscriptions
│   ├── health/checks/     # Sondas de saúde
│   ├── observability/     # Emissão de métricas/logs
│   ├── wa-providers/      # Adapter WhatsApp Cloud/Evolution
│   ├── enrichment/        # Contact enrichment
│   └── security/          # HIBP, validação
├── components/            # UI (shadcn-based)
├── hooks/                 # React hooks
└── integrations/supabase/ # Clientes gerados (não editar)
```

## Pontos fortes

- **Runtime único e canônico** (`createAndExecuteRun` → `executeRun`) — validado nas missões RUNTIME-CANONICAL-ENFORCEMENT e RUNTIME-PARITY.
- **Boundary client/server rigoroso** — arquivos `.server.ts` bloqueados por import-guard; `createServerFn` é a única ponte RPC.
- **Auth middleware centralizado** (`requireSupabaseAuth`) — todas as server functions autenticadas passam pelo mesmo pipeline.
- **File-based routing determinístico** — sem `App.tsx` monolítico, sem React Router paralelo.
- **Multi-tenant real** via `company_id` em quase todas as tabelas + funções `current_company_id()` e `is_company_member()`.
- **Convenção uniforme** `.functions.ts` (RPC) vs `.server.ts` (helpers admin/webhooks).

## Riscos

| ID | Severidade | Achado |
|---|---|---|
| ARCH-H-01 | **High** | Dois módulos concentram muita responsabilidade (`flow-executor`, `inbox`). Em `src/lib/` há 63 arquivos de topo — falta subdomínios (`src/lib/flows/`, `src/lib/inbox/`) para escalar. |
| ARCH-M-02 | Medium | Convenção `.server.ts` vs `.functions.ts` correta, mas alguns helpers híbridos (ex.: `guardian.functions.ts` + `guardian.server.ts` + `guardian-reporter.ts` + `guardian.types.ts`) diluem o "canonical entry point". |
| ARCH-M-03 | Medium | Camada de contratos (`src/lib/contracts/`) existe mas não é consumida por todas as functions — Zod schemas duplicados em cascade/broadcasts/flows. |
| ARCH-L-04 | Low | Falta documentação viva de dependências entre módulos (grafo). `madge` já rodou em auditoria anterior mas o resultado não é publicado. |

## Evidências

- `find src/lib -maxdepth 1 -type f | wc -l` → 43 arquivos no topo.
- `grep -rl "createServerFn" src/lib src/routes | wc -l` → 31 arquivos.
- `find src/routes -name "*.tsx" | wc -l` → 33 rotas.
- Estrutura `_authenticated.*` — 27 rotas protegidas + 3 públicas (`/`, `/auth`, `/invite/$token`).

## Recomendações (backlog)

- **ARCH-H-01** → reagrupar `src/lib/*` em subdomínios (`flows/`, `inbox/`, `crm/`, `broadcasts/`, `agents/`, `channels/`). **Pós-piloto**.
- **ARCH-M-02** → um `README.md` por subdomínio explicando entry point público vs helpers internos. **Pós-piloto**.
- **ARCH-M-03** → consolidar Zod schemas em `src/lib/contracts/` e importar de lá. **Pós-piloto**.
- **ARCH-L-04** → publicar grafo `madge` como artefato de CI. **Baixa prioridade**.

**Recomendação Fase 1:** núcleo arquitetural **congelável para o piloto**. Nenhum risco Critical. Highs são de organização/legibilidade, não de correção.
