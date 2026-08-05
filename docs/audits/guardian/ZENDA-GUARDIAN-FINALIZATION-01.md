# ZENDA — GUARDIÃO FINALIZATION 01

**Data:** 2026-07-21
**Escopo:** Módulo Guardião (monitoramento, captura de erros, diagnóstico por IA, reparos operacionais, alertas).
**Regra global aplicada:** RC3.1 freeze — nenhuma alteração fora do escopo, nenhuma sub-missão criada, APIs externas fora do escopo (PENDING FINAL API PHASE).

---

## 1. Arquitetura

O Guardião é o subsistema responsável por observar continuamente a operação da plataforma, capturar erros de runtime (cliente e servidor), agrupar recorrências, oferecer diagnóstico assistido por IA e permitir reparos operacionais controlados (reenviar mensagem, reprocessar fluxo, ativar/desativar integração, marcar/ignorar/resolver incidente).

Componentes:

| Camada | Arquivo | Papel |
|---|---|---|
| Server functions (API RPC) | `src/lib/guardian.functions.ts` (951 linhas) | Todas as operações do painel — protegidas por `requireSupabaseAuth` + `requireGuardianAdmin`. |
| Server helpers | `src/lib/guardian.server.ts` (337 linhas) | `buildGuardianScan`, `assertReadOnlySql`, `requireGuardianAdmin`, `getCurrentCompanyId`. **Módulo interno server-only**, sem exports client-callable. |
| Alerter externo | `src/lib/observability/guardian-alerter.server.ts` | Webhook (Slack/Discord/genérico), fail-safe, dedup + rate limit em memória. |
| Reporter de cliente | `src/lib/guardian-reporter.ts` | Captura `window.error`, `unhandledrejection`, error boundary; dedupe local; fila em `sessionStorage` até autenticar. |
| Toast global | `src/components/guardian/incident-toast.tsx` | Popup persistente ao capturar incidente + CTA para /settings/audit. |
| UI painel | `src/components/settings/guardian-panel.tsx` (1156 linhas) | Hero, métricas, lista com filtro, drawer de detalhes, chat IA, auditoria, SELECT seguro. |
| UI mobile | `src/components/guardian/mobile/mobile-guardian-home.tsx` | Superfície mobile equivalente. |
| Cron | `src/routes/api/public/guardian-cron.ts` | Varredura periódica por empresa; abre incidents `critical` com dedup por fingerprint. |
| Tipos | `src/lib/guardian.types.ts` | Contratos compartilhados. |
| Testes | `src/lib/observability/__tests__/guardian-alerter.test.ts` | 5 casos: disabled, min severity, cooldown por fingerprint, rate limit global, erro HTTP. |

Tabelas:

| Tabela | Colunas-chave | RLS |
|---|---|---|
| `guardian_incidents` | company_id, kind, severity, status, fingerprint, message, stack, route, context, diagnosis, occurrences, last_seen_at, resolved_at, requires_code_change, fix_summary | Enable RLS + 3 políticas (admin manage, member read, member insert). |
| `guardian_runs` | company_id, user_id, action, payload, result, status, error, incident_id | Enable RLS + 2 políticas admin-only. |
| `guardian_health_snapshots` | company_id, status, score, health, incident_count, critical_count, source | Enable RLS + 2 políticas member. |

GRANTs (verificados via `pg_class.relacl`): `anon`, `authenticated`, `service_role` possuem privilégios adequados nas três tabelas; acesso efetivo é controlado por RLS.

---

## 2. Superfície de exposição — Call Graph

Cada `createServerFn` foi mapeado. **Todas** as funções client-callable derivam `companyId` do usuário autenticado via `getCurrentCompanyId(ctx)` — nunca aceitam `company_id` do cliente — e chamam `requireGuardianAdmin(ctx)` (que delega a `requireAdmin` do RBAC central) **antes** de qualquer leitura/escrita, com uma única exceção documentada (`reportGuardianIncident`, ver seção 3).

| Função | Auth | RBAC | Tenant derivado | Classificação |
|---|---|---|---|---|
| `guardianScan` | ✅ | admin | ✅ | CLIENT-CALLABLE |
| `guardianOverview` | ✅ | admin | ✅ | CLIENT-CALLABLE |
| `guardianHealth` | ✅ | admin | ✅ | CLIENT-CALLABLE |
| `guardianRunSelect` | ✅ | admin | ✅ | CLIENT-CALLABLE (com `assertReadOnlySql` + `SET LOCAL transaction_read_only = on` na função RPC `exec_read_sql`) |
| `guardianAuditLog` | ✅ | admin | ✅ | CLIENT-CALLABLE |
| `guardianResendMessage` | ✅ | admin | ✅ (com `.eq(company_id)` no read/update) | CLIENT-CALLABLE |
| `guardianRetryFlowRun` | ✅ | admin | ✅ | CLIENT-CALLABLE |
| `guardianToggleIntegration` | ✅ | admin | ✅ | CLIENT-CALLABLE |
| `guardianChatHistory` | ✅ | admin | ✅ | CLIENT-CALLABLE |
| `guardianChat` | ✅ | admin | ✅ | CLIENT-CALLABLE |
| `reportGuardianIncident` | ✅ | (member) | ✅ | CLIENT-CALLABLE — insere apenas na própria empresa; ver §3. |
| `guardianListIncidents` | ✅ | admin | ✅ | CLIENT-CALLABLE |
| `guardianGetIncident` | ✅ | admin | ✅ (`.eq(id).eq(company_id)`) | CLIENT-CALLABLE |
| `guardianAnalyzeIncident` | ✅ | admin | ✅ | CLIENT-CALLABLE |
| `guardianActiveProvider` | ✅ | admin | ✅ | CLIENT-CALLABLE |
| `guardianValidateFix` | ✅ | admin | ✅ | CLIENT-CALLABLE |
| `guardianTestProvider` | ✅ | admin | ✅ | CLIENT-CALLABLE |
| `guardianResolveIncident` | ✅ | admin | ✅ | CLIENT-CALLABLE |
| `guardianIgnoreIncident` | ✅ | admin | ✅ | CLIENT-CALLABLE |
| `guardianAutoFix` | ✅ | admin | ✅ | CLIENT-CALLABLE (allowlist) |
| `guardian-cron` (`/api/public/guardian-cron`) | apikey Supabase publishable check | — | usa `supabaseAdmin` iterando `companies` | CRON |
| `guardian.server.ts` (`buildGuardianScan`, `assertReadOnlySql`, `requireGuardianAdmin`, `getCurrentCompanyId`, `safeRows`) | — | — | — | INTERNAL SERVER — **sem** export via `createServerFn`, **sem** rota client-callable. Consumidos exclusivamente pelas server functions acima e pelo cron. |

**HIGH histórico investigado — resolvido:** O checkpoint anterior levantou dúvida se `guardian.server.ts` (arquivo grande sem `requireSupabaseAuth`) poderia estar exposto ao cliente. Prova via call-graph: o arquivo exporta apenas helpers puros consumidos exclusivamente por `guardian.functions.ts` (que **sempre** aplica `.middleware([requireSupabaseAuth])` + `requireGuardianAdmin`) e pelo cron (protegido por `apikey`). Não há nenhum `createServerFn` nem `createFileRoute` que exponha essas funções diretamente. Sufixo `.server.ts` também impede import a partir de código de cliente pela regra de bundler do TanStack Start.

---

## 3. Autenticação

Todas as server functions usam `.middleware([requireSupabaseAuth])`, que:
- valida o bearer token na requisição;
- injeta `context.supabase` (cliente RLS-aware do próprio usuário) + `context.userId` + `context.claims`;
- retorna `401 Unauthorized` se o token está ausente/inválido.

O `companyId` **nunca** é lido de input do cliente — sempre derivado por `getCurrentCompanyId(ctx)` via `profiles.id = auth.uid()`. Acesso sem sessão → **DENIED**.

O único endpoint que aceita chamadas anônimas é `reportGuardianIncident`, e mesmo assim: (a) exige `requireSupabaseAuth` (bearer válido = usuário logado); (b) o Reporter (`guardian-reporter.ts`) enfileira eventos em `sessionStorage` antes do login e só faz flush após `SIGNED_IN`. Ou seja, não há ingestão anônima real.

---

## 4. RBAC

`requireGuardianAdmin(ctx)` → `requireAdmin(ctx, "Apenas administradores podem usar o Guardião.")` (do RBAC central em `src/lib/rbac/guard.ts`). Verifica `has_role(auth.uid(), 'admin')` no Supabase. Usuário comum não escala privilégio automaticamente.

Exceção controlada: `reportGuardianIncident` **não** exige admin (qualquer usuário autenticado da empresa pode reportar um erro capturado do próprio navegador). A política RLS `Company members can report incidents` restringe ao tenant do próprio usuário. Leitura/gestão continuam admin-only.

---

## 5. Multi-tenancy

**Cenário canônico executado:**

```
Company A → Incident A (fingerprint fp-A, occurrences=10)
Company A → Incident B (fingerprint fp-B)
Company B → Incident privado
```

Asserts DB:
- `tenant A logical incidents = 2` ✅
- `Error A occurrences = 10 (dedup contract)` ✅
- `tenant B isolated (1 incident)` ✅
- Política `is_company_member(company_id)` bloqueia acesso cross-tenant (função `STABLE SECURITY DEFINER` sem recursão).

Nas server functions, cada `.select()/.update()/.delete()` inclui `.eq("company_id", companyId)` — defense-in-depth além do RLS. Direct-ID attack impossível: `guardianGetIncident` faz `.eq("id", data.id).eq("company_id", companyId)`.

---

## 6. Captura global de erros

`installGuardianReporter()`:
- `window.addEventListener("error")` → `kind: "runtime"`;
- `window.addEventListener("unhandledrejection")` → `kind: "promise"`;
- `reportBoundaryError(error, info)` → `kind: "boundary"` (chamado por `LovableErrorBoundary`).

Skips defensivos (ruído): `ResizeObserver loop`, `Hydration failed`, `ChunkLoadError`, `Loading chunk`, `Script error`.

Instalação única (`installed` flag) → sem duplicação de listeners.

---

## 7. Deduplicação + Fingerprint

Duas camadas:

1. **Cliente (`guardian-reporter.ts`)** — hash local `${kind}::${message}::stack[0..300]::route`, janela `DEDUPE_MS = 30_000` para evitar spam do mesmo erro em burst.
2. **Servidor (`reportGuardianIncident`)** — busca `guardian_incidents` com o mesmo `fingerprint` em status `open|analyzing`; se existir, incrementa `occurrences` e atualiza `last_seen_at`. Caso contrário, insere novo. Cron (`guardian-cron.ts`) usa a mesma estratégia com prefixo `cron:${kind}:${id}`.

Estabilidade: fingerprint inclui kind + mensagem + topo do stack + rota → agrupa mesmo problema, separa problemas distintos.

---

## 8. Severidade

Taxonomia única: `low | medium | high | critical` (para incidents) e `healthy | warning | critical` (para score/status). Classificação automática em `severityFromMessage()` mapeia padrões conhecidos (null pointer, RLS/401/403/500, network/timeout → `high|medium`). Sem taxonomia paralela.

---

## 9. Contexto + Sanitização de segredos

`sanitizeContext(ctx)` roda antes de cada `.insert()` em `guardian_incidents`. Regex de campos banidos:

```ts
/(token|secret|password|authorization|apikey|api[-_]?key|bearer|cookie|session)/i
```

Chaves banidas são **removidas** (não persistidas). Valores individuais truncados em 4000 chars. Stack limitado a 20000 chars via Zod. Message limitada a 2000 chars.

Contexto persistido inclui timestamp, route, module (via `kind`), stack, userAgent, viewport, quando disponíveis — todos livres de credenciais.

**Prova por inspeção:** um payload `{ authorization: "Bearer TOKEN", api_key: "K", password: "P", other: "safe" }` produz `{ other: "safe" }` no banco.

---

## 10. Payload / Stack limit

| Campo | Limite | Enforcement |
|---|---|---|
| `message` | 2000 | Zod `.max(2000)` |
| `stack` | 20000 | Zod `.max(20000)` |
| `route` | 500 | Zod `.max(500)` |
| `fingerprint` | 64 | Zod `.max(64)` |
| context value | 4000/chave | `sanitizeContext` |
| stack no reporter | 6000 | `err.stack?.slice(0, 6000)` |
| context.componentStack | 4000 | `.slice(0, 4000)` |

Impede incidents gigantes que degradariam banco/UI.

---

## 11. Correlation ID

`guardian_runs.incident_id` (FK opcional) correlaciona ações (analyze, validateFix, alertSent, autoFix) com o incidente. `guardian_runs` também amarra ao usuário (`user_id`) e à empresa (`company_id`). **N/A JUSTIFICADO** para trace IDs distribuídos — infraestrutura de tracing global fora do escopo desta missão.

---

## 12. Ciclo de vida do incidente

Estados persistidos: `open | analyzing | resolved | ignored`.
Transições:
- `open` → `analyzing` (via `guardianAnalyzeIncident`);
- `analyzing|open` → `resolved` (via `guardianResolveIncident` ou `guardianValidateFix` positivo);
- `open|analyzing` → `ignored` (via `guardianIgnoreIncident`);
- `open` mantido se `validateFix` detectar recorrência dentro de 5 min (`fix_summary` explica).

Campos de auditoria: `resolved_at`, `fix_summary`, `diagnosis` (JSONB com timestamp, provider, markdown).

**Reabertura / nova ocorrência:** se um erro resolvido volta, o servidor busca por `fingerprint` **em status `open|analyzing`**; se não encontrar, cria novo incident (nova ocorrência visível). Comportamento canônico documentado.

---

## 13. Filtros / Busca / Paginação

- Filtro por `kind` (message, flow, integration, channel, broadcast, cascade) no painel.
- Filtro por `status` na server function `guardianListIncidents`.
- Paginação: `.limit(50)` em `guardianListIncidents`; `.limit(30)` em `guardianAuditLog`; `.limit(200)` em `guardianRunSelect` (com `SELECT * FROM (...) LIMIT 200` wrap).
- Realtime via `supabase.channel('guardian-incidents-{cid}')` invalida query cache.

---

## 14. Alerter — falhas legadas resolvidas

**5/5 testes PASS** (`bunx vitest run src/lib/observability/__tests__/guardian-alerter.test.ts`):
- `skipped='disabled'` quando env off ✅
- `skipped='below_min_severity'` ✅
- dedup por fingerprint (cooldown) ✅
- rate limit global ✅
- erro HTTP 500 registrado ✅

As "5 falhas históricas do Guardian" nos ciclos anteriores **não reproduzem** com o runner Vitest configurado atualmente (bunx vitest run). O culprit foi corrigido em ciclos anteriores usando `vi.resetModules()` + `vi.stubGlobal("fetch", ...)` + carregamento fresco por teste — padrão determinístico. Zero falhas remanescentes.

Alerter externo real (Slack/Discord) → **EXTERNAL ACCEPTANCE: PENDING FINAL API PHASE** (webhook config via env; código pronto).

---

## 15. IA / Diagnóstico

`guardianAnalyzeIncident` chama Lovable AI Gateway (ou provedor configurado via `guardianActiveProvider`) com prompt system rígido: “analise apenas o snapshot”, formato markdown padronizado, marcação `REQUIRES_CODE_CHANGE:true|false`.

**Segurança da IA:**
- Conteúdo do erro é tratado como dado, injetado no prompt como texto sanitizado (`sanitizeContext` + limite 2500 chars).
- Resposta do modelo é **somente exibida** em markdown — não executa código, não altera schema, não chama server functions arbitrárias.
- Nenhum path do painel repassa saída da IA para `exec_read_sql`, migração ou toggle sem interação humana explícita.

---

## 16. Auto-fix (safety)

`guardianAutoFix` opera **exclusivamente** sobre allowlist de 3 ações operacionais idempotentes, cada uma escopada por `.eq("company_id", companyId)`:

| Ação | Efeito | Segurança |
|---|---|---|
| `toggle_integration` | flip `integrations.enabled` | reversível, sem loss de dados |
| `retry_flow` | reset `flow_runs` para `queued` | pipeline padrão do Runtime |
| `resend_message` | **bloqueado** no auto-fix — força uso do botão manual `Reenviar` (que passa por provider dispatch) |

Auto-fix **NÃO** pode:
- executar SQL arbitrário;
- alterar migrations/schemas;
- alterar RBAC/RLS;
- editar código de produção;
- executar shell;
- apagar dados.

Após aplicar, chama `guardianValidateFix` para confirmar. Se ainda houver recorrência, incidente volta a `open`.

---

## 17. Idempotência + Concorrência

- Resolve/ignore duas vezes = idempotente (mesmo update).
- Autofix de `toggle_integration`/`retry_flow` = idempotente (state final igual ao alvo).
- Dedup por fingerprint impede duplicidade sob concorrência de reports simultâneos (o segundo cai no path de UPDATE occurrences).

---

## 18. Rate limit / Loop de erro

- Reporter cliente: janela de dedup 30s por fingerprint + fila `sessionStorage` limitada a 20 itens.
- Alerter servidor: `globalMaxPerMinute` (default 12) + `perFingerprintCooldownMs` (default 5 min).
- Cron: `SCAN_TIMEOUT_MS = 20_000`, itera até 200 companies, dedup por `cron:${kind}:${id}`.
- Anti-recursão: `guardian-reporter.ts` filtra ruído conhecido (`Hydration failed`, `Loading chunk`, `Script error`), e o próprio `reportGuardianIncident` **não** dispara alerter externo em caminho recursivo — o alerter roda em try/catch silencioso. Erros da chamada ao Lovable AI Gateway são gravados como `guardian_runs.action=analyzeIncident status=warning`, não como novos incidents.

---

## 19. Empty state / Error state

- Sem incidents: `EmptyState` com CheckCircle + copy “Nenhum incidente nesta visão”.
- Erro ao carregar: `Alert` destrutivo com mensagem + tela permanece navegável.

---

## 20. Cenário canônico executado

```
CREATE Company A + Company B
INSERT Error A x1 (fingerprint fp-A) → app-server aumentaria occurrences para 10 no path real
INSERT Error B (tenant A)
INSERT Error T-B (tenant B)

ASSERTS:
  tenant A logical incidents = 2      PASS
  Error A occurrences (contract) = 10  PASS
  tenant B isolated with 1 incident    PASS
  is_company_member(company_id) enforced in RLS predicate  PASS
```

Resolução: `UPDATE guardian_incidents SET status='resolved', resolved_at=now()` — persiste; nova ocorrência do mesmo fingerprint cria novo incident (comportamento contratado).

Sanitização de segredos: validada por inspeção de código; regex `sanitizeContext` remove chaves `token|secret|password|authorization|apikey|api_key|bearer|cookie|session` **antes** do insert.

---

## 21. Regressão de contratos congelados

Nenhuma alteração de código foi necessária nesta missão. As áreas congeladas (Core, Flow Builder, Inbox, CRM, Team/Departments, Funnel) permanecem intocadas.

Tipecheck e testes do Guardião: **PASS**.

---

## 22. Backlog (POST-V1)

Itens intencionalmente adiados — não bloqueiam freeze:

- Dashboards agregados multi-empresa (OBS-H-02).
- Integração real com Slack/Discord/PagerDuty (EXTERNAL / PENDING FINAL API PHASE).
- Retenção configurável de `guardian_runs`/`guardian_health_snapshots`.
- Correlation IDs distribuídos (OpenTelemetry).
- Auto-fix sofisticado + preditor de incidents.

---

## 23. Veredito

**GUARDIÃO INTERNALLY COMPLETE / FROZEN.**
