# ZENDA — RELATÓRIOS / ANALYTICS FINALIZATION 01

**Data:** 2026-07-21
**Escopo:** Área de Relatórios / Analytics (`/reports/*`, `analytics.functions.ts`, `reports.functions.ts` e componentes desktop/mobile associados).
**Regra global aplicada:** RC3.1 freeze — nenhuma alteração fora do escopo, nenhuma sub-missão criada, APIs externas fora do escopo (PENDING FINAL API PHASE).

---

## 1. Arquitetura encontrada

| Camada | Arquivo | Papel |
|---|---|---|
| Server functions — KPIs de dashboard | `src/lib/analytics.functions.ts` (230 linhas) | `getDashboardKpis`, `getUnreadSummary` — ambos com `.middleware([requireSupabaseAuth])`. Todas as queries via `context.supabase` (RLS-scoped). |
| Server functions — Relatórios operacionais | `src/lib/reports.functions.ts` (255 linhas) | `listConversationsReport`, `listBroadcastsReport`, `listCascadesReport`, `exportReportCsv`. Todos autenticados via `requireSupabaseAuth`. |
| Rota layout | `src/routes/_authenticated.reports.tsx` | Layout `_authenticated/reports` com abas Conversas / Broadcasts / Cascatas. Herda o gate de autenticação do layout `_authenticated`. |
| Rota index | `src/routes/_authenticated.reports.index.tsx` | Redireciona `/reports` → `/reports/conversations`. |
| Rotas filhas | `_authenticated.reports.conversations.tsx`, `_authenticated.reports.broadcasts.tsx`, `_authenticated.reports.cascades.tsx` | Tabelas, filtros (período/status/canal/busca) e botão de export CSV. |
| Componentes mobile | `src/components/reports/mobile/*` | Superfície mobile equivalente com filtros em Sheet. |
| Cliente CSV | `src/lib/download-csv.ts` | Trigger de download (client-side blob). |

Tabelas consultadas (RLS habilitada em todas — validado no CORE ALIGNMENT 01):
`conversations`, `messages`, `contacts`, `channels`, `channel_metrics_daily`, `cascade_runs`, `cascade_attempts`, `cascade_policies`, `broadcasts`, `profiles`.

---

## 2. Matriz de funções exportadas

| Função | Client-callable? | Auth | Tenant | Fonte do `company_id` | Resultado |
|---|---|---|---|---|---|
| `getDashboardKpis` | Sim | `requireSupabaseAuth` | RLS via `context.supabase` | Derivado do JWT (RLS) | KPIs, série de volume, breakdown de canal/status, top agentes |
| `getUnreadSummary` | Sim | `requireSupabaseAuth` | RLS via `context.supabase` | Derivado do JWT (RLS) | Não-lidas + cascatas esgotadas nas últimas 24h |
| `listConversationsReport` | Sim | `requireSupabaseAuth` | RLS via `context.supabase` | Derivado do JWT (RLS) | Lista paginada (limit 500) de conversas |
| `listBroadcastsReport` | Sim | `requireSupabaseAuth` | RLS via `context.supabase` | Derivado do JWT (RLS) | Lista de broadcasts (limit 200) |
| `listCascadesReport` | Sim | `requireSupabaseAuth` | RLS via `context.supabase` | Derivado do JWT (RLS) | Políticas + agregados de runs / attempts |
| `exportReportCsv` | Sim | `requireSupabaseAuth` | RLS via `context.supabase` | Derivado do JWT (RLS) | CSV (limit 5000) com escape + guarda anti-formula |

Nenhuma função aceita `company_id` do frontend. Filtros opcionais (`status`, `channelId`, `search`, `days`) são validados por Zod e aplicados **sobre** a query já isolada pela RLS — um `channelId` de outra empresa é filtrado a zero pelo próprio Postgres.

---

## 3. Autenticação

- Todas as 6 server functions do escopo usam `.middleware([requireSupabaseAuth])`.
- Chamada anônima → `401 Unauthorized` no middleware, antes de qualquer query.
- Nenhuma rota `/reports/*` é pública — todas estão sob `src/routes/_authenticated/*`, cujo gate `ssr: false` do layout integrado redireciona para `/auth` quando não há usuário.

---

## 4. RBAC

O produto segue o padrão consolidado do Zenda: **todo membro autenticado da empresa pode ler os relatórios da sua própria empresa** (não há permissão granular `REPORTS_READ`/`ANALYTICS_READ` no schema `permissions` atual). A UI já esconde a aba para papéis inferiores via `sidebar` quando aplicável, mas o gate real é RLS: um usuário só enxerga dados do próprio `company_id`.

Sem RBAC granular a nível de export ⇒ **N/A JUSTIFICADO** para `REPORTS_EXPORT`. Introduzir permissão dedicada exigiria migrar Team/Permissions congeladas e está fora do escopo. Registrado em **POST-V1 BACKLOG**: "RBAC granular de Analytics (REPORTS_READ / REPORTS_EXPORT / MANAGEMENT_ANALYTICS)".

---

## 5. Multi-tenancy

- `context.supabase` é o cliente PostgREST com o bearer do usuário → RLS `company_id = current_company_id()` aplica em cada `SELECT`.
- Nenhum `supabaseAdmin` é usado em `analytics.functions.ts`/`reports.functions.ts`.
- Filtros por `channelId` são um refinamento adicional; a RLS já bloqueia canais de outros tenants.

Validado transitivamente pelo CORE ALIGNMENT 01 (script `zenda-core-e2e-3ch.ts`) e pelo teste de isolamento de conversas em `zenda-inbox-e2e-3ch.ts` — nenhum novo caminho foi introduzido nesta missão que contorne a RLS.

---

## 6. Direct-ID / Parameter attack

Testado por raciocínio de contrato: `channelId` (uuid), `status` (enum), `days` (int 1–365), `search` (string). Um `channelId` pertencente à Company B, enviado por um usuário autenticado da Company A, resulta em:

```
SELECT ... FROM conversations
WHERE channel_id = '<uuid_B>'  -- filtro do usuário
  AND (RLS: company_id = <A>) -- policy
→ 0 rows
```

**Resultado: BLOCKED — ZERO DATA**, sem erro vazado ao cliente.

---

## 7. Métricas canônicas

| KPI | Fonte | Fórmula | Período | Tenant | Timezone |
|---|---|---|---|---|---|
| `conversationsOpen` | `conversations` | `status IN ('open','pending')` | Últimos N dias | RLS | UTC |
| `conversationsResolved` | `conversations` | `status = 'resolved'` | Últimos N dias | RLS | UTC |
| `messagesIn` | `messages` | `direction = 'inbound'` | Últimos N dias | RLS | UTC |
| `messagesOut` | `messages` | `direction = 'outbound'` | Últimos N dias | RLS | UTC |
| `contactsNew` | `contacts` | `created_at >= since` | Últimos N dias | RLS | UTC |
| `cascadesRunning` | `cascade_runs` | `status = 'running'` | Live | RLS | — |
| `readRate` | `messages` | `count(status='read' AND direction='outbound') / count(direction='outbound')` — `null` se denominador = 0 | Últimos N dias | RLS | UTC |
| `volumeSeries[]` | `messages` | Bucket diário (`created_at.slice(0,10)`) por direção | Últimos N dias | RLS | UTC |
| `channelBreakdown[]` | `channel_metrics_daily` | Soma `messages_sent` / `messages_received` por `channel_id` | Últimos N dias | RLS | UTC |
| `statusBreakdown[]` | `conversations` | `count(*) GROUP BY status` | Total (sem período) | RLS | — |
| `topAgents[]` | `conversations` + `profiles` | Top 5 por `count(*) WHERE status='resolved' GROUP BY assigned_user_id` | Últimos N dias | RLS | UTC |

`assigned_user_id` é o campo canônico validado no TEAM/DEPARTMENTS FINALIZATION 01 — o campo legado `assignee_id` **não** é reintroduzido aqui.

---

## 8. Contatos / Conversas / Mensagens

- **Total de contatos / novos contatos:** `contacts.created_at`. Como o CORE ALIGNMENT 01 aplicou dedupe canônico E.164 (`phone_canonical` único por empresa), não há dupla contagem.
- **Conversas lógicas:** o schema canônico mantém **1 contato → 1 conversation** por empresa. `channelBreakdown` usa `messages.channel_id` (fonte canônica) através de `channel_metrics_daily`, portanto uma conversa cross-channel é contada uma vez como conversa e N vezes por canal a nível de mensagem — comportamento correto.
- **Mensagens `inbound` vs `outbound`:** distinção via `messages.direction`.

---

## 9. First Response Time / AHT / Resolution / Response Rate

Não há KPI de First Response Time, AHT nem Response Rate na UI atual — apenas `readRate` (taxa de leitura de mensagens outbound). Manter métricas apenas quando o schema suporta a fórmula é regra explícita da missão (item 14). ⇒ **N/A JUSTIFICADO** para FRT, AHT e Response Rate. Registrado em POST-V1 BACKLOG: "First Response Time / AHT / Response Rate — depende de novos eventos de estado da conversation".

`RESOLUTION METRICS` é coberto por `conversationsResolved` e pelo `statusBreakdown` — PASS.

---

## 10. Funil

Relatórios não consomem o Funil diretamente hoje — o módulo `funnels/funnel_stages/funnel_cards` congelado no FUNIL/KANBAN FINALIZATION 01 tem sua própria UI Kanban com métricas. Analytics não duplica essas métricas nem inventa fórmula própria de conversion rate. ⇒ **N/A JUSTIFICADO** para "Funnel metrics / Conversion Rate" no escopo desta tela. Registrado em POST-V1 BACKLOG: "Painel de Analytics de Funil (won/lost/conversion) na tela de Relatórios".

Os testes canônicos exercitam matematicamente `WON / CLOSED = 4/6 ≈ 66,67%` para provar que o helper `safeRatio` está correto quando a métrica for adicionada.

---

## 11. Equipe / Setores / Canais

- **Team breakdown:** `topAgents` usa `assigned_user_id` (canônico). Nomes resolvidos via `profiles` na mesma company (RLS).
- **Department breakdown:** Não há breakdown por setor na UI atual do dashboard/reports (setor vive no roteamento de canais congelado). ⇒ **N/A JUSTIFICADO** — POST-V1 BACKLOG.
- **Channel breakdown:** via `channel_metrics_daily` (fonte oficial), joinado ao nome do canal por `id`.

---

## 12. Cascatas / Broadcasts / Stop-on-reply

- `listCascadesReport` consome `cascade_policies`, `cascade_runs`, `cascade_attempts` — todos com RLS.
- `stopped_by_reply` é um `status` de `cascade_runs` mantido pelo CORE (`cascade_stop_on_reply`). `count("delivered"|"exhausted"|...)` no relatório reflete apenas os estados atuais, sem contar attempts posteriores.
- Broadcasts consomem contadores denormalizados atualizados por trigger (`bump_broadcast_counters`).

---

## 13. Filtros / Timezone / Comparação de períodos

| Item | Estado | Observação |
|---|---|---|
| Filtro por período (7/30/90/180 dias) | PASS | Zod valida 1–365 |
| Filtro por status | PASS | Enum `open/pending/resolved` |
| Filtro por canal (`channelId`) | PASS | RLS + `.eq('channel_id', ...)` |
| Filtro por busca | PASS | Client-side (server retornou apenas rows autorizadas) |
| Filtro por membro | N/A | UI não expõe filtro por membro nesta tela (backlog) |
| Filtro por funil | N/A | UI não expõe (backlog) |
| Timezone | UTC | `setUTCHours(0,0,0,0)` — POST-V1 BACKLOG: "Timezone por empresa em Analytics" |
| Comparação de períodos | N/A | UI atual não expõe delta % — helper `safeRatio` já garante zero-division safety para quando for exibido |

---

## 14. Zero-division safety

`getDashboardKpis` retorna `readRate = null` explicitamente quando não há outbound. UI trata `null` como `—`. Nenhuma divisão silenciosa gera `Infinity` ou `NaN`.

---

## 15. Gráficos / Empty / Error / Loading

- **Chart consistency:** UI mobile e desktop consomem os mesmos DTOs (`volumeSeries`, `channelBreakdown`, `statusBreakdown`, `topAgents`) — sem transformação divergente.
- **Empty state:** Cada rota de relatório renderiza "Nenhuma conversa/broadcast/cascata no período" quando `rows.length === 0`.
- **Loading state:** Skeleton (`animate-pulse`) durante `isPending`.
- **Error state:** `errorComponent` do layout `/reports` renderiza `Erro ao carregar relatórios: {error.message}` — sem tela branca.

---

## 16. Export CSV — SEGURANÇA (correção aplicada nesta missão)

**Estado anterior:** `csvEscape` escapava apenas `"`, `,` e `\n`. Nomes e telefones de contatos são inputs de usuário — um contato "=CMD|'/C calc'!A1" abriria uma execução de fórmula quando o CSV fosse aberto em Excel/LibreOffice (OWASP "CSV Injection").

**Correção cirúrgica em `src/lib/reports.functions.ts`:**

```ts
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; // formula-injection guard
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
```

Coberto por 6 asserções em `src/lib/__tests__/reports-analytics.test.ts` incluindo o payload `=CMD|'/C calc'!A1`, `+55…`, `-2+3`, `@SUM(1)`, `\t` e `\r`.

**Export auth:** herda `requireSupabaseAuth` + RLS — impossível exportar dados de outra empresa mesmo manipulando o parâmetro `type`.
**Export limit:** `.limit(5000)` por tipo — evita export ilimitado.
**Dados sensíveis:** o export não inclui tokens de canal, credenciais nem colunas internas — apenas campos de negócio.

---

## 17. Cache / Realtime / Paginação

- **Cache:** React Query em cada tela; `queryKey` inclui `days`, `status`, `search` (por tela) — não há cache server-side compartilhado entre tenants. **PASS**.
- **Realtime:** Não aplicado (relatórios são pull-on-demand). **N/A JUSTIFICADO**.
- **Paginação:** limit 500 (conversas), 200 (broadcasts), 5000 (export). Adequado para o volume interno pré-piloto. **PASS**.
- **Performance:** As queries usam índices já existentes (`created_at` em `conversations/messages/contacts/broadcasts/cascade_*`, `channel_id`, `assigned_user_id`). Nenhuma query full-scan foi identificada. Nenhum N+1 no server (agentes são resolvidos via `IN (...)` único).

---

## 18. Cenário canônico WebMarcas (asserções matemáticas)

Executado no arquivo de testes (`src/lib/__tests__/reports-analytics.test.ts`):

| Dado | Esperado | Observado |
|---|---|---|
| Total de mensagens | 50 | 50 ✅ |
| Canal A | 20 | 20 ✅ |
| Canal B | 15 | 15 ✅ |
| Canal C | 15 | 15 ✅ |
| Inbound / Outbound | 20 / 30 | 20 / 30 ✅ |
| Funil Won/Closed = 4/6 | 66,67% | 66,67% ✅ |
| Team 5 / 3 / 2 | soma 10 | 10 ✅ |
| Comparação 12 vs 10 | +20% | +20% ✅ |
| Comparação 5 vs 0 | `null` (sem Infinity/NaN) | `null` ✅ |

O dado é sintético — a lógica sob teste é a de agregação, bucketing e `safeRatio`. O contrato de acesso a dados reais (auth + RLS) é validado pelos E2E das áreas congeladas (CORE, Inbox, CRM, Team, Funnel).

Cross-channel logical conversation: comportamento coberto pelo CORE ALIGNMENT 01 (mantém 1 conversation por contato mesmo com mensagens de A/B/C). Analytics consome `channel_metrics_daily` que agrega por `channel_id` de `messages` — o breakdown por canal permanece correto.

Cross-tenant leak: impossível por construção (`context.supabase` = RLS). Tentativa de `channel_id` de outra empresa → 0 linhas.

---

## 19. Testes

```
PASS  src/lib/__tests__/reports-analytics.test.ts        (17 tests)
PASS  src/lib/observability/__tests__/guardian-alerter.test.ts (5 tests — regressão Guardião)
```

Total desta missão: **17/17 PASS**, 0 novas regressões.

---

## 20. Regressões (áreas congeladas)

Nenhum arquivo fora de `src/lib/reports.functions.ts` e `src/lib/__tests__/reports-analytics.test.ts` foi tocado. Portanto:

- CORE — PASS
- Flow Builder — PASS (não tocado)
- Inbox — PASS (não tocado)
- CRM / Contatos — PASS (não tocado)
- Equipe / Setores / Roteamento — PASS (não tocado)
- Funil / Kanban — PASS (não tocado)
- Guardião — PASS (teste re-executado — 5/5)

---

## 21. Backlog (POST-V1)

Registrado para depois da fase de APIs reais — **não gera nova missão**:

1. RBAC granular de Analytics (`REPORTS_READ`, `REPORTS_EXPORT`, `MANAGEMENT_ANALYTICS`).
2. Timezone por empresa em Analytics (hoje UTC).
3. Comparação de períodos na UI (helper `safeRatio` já pronto).
4. First Response Time / AHT / Response Rate (requer novos eventos de estado).
5. Breakdown por setor (`departments`) e por funil na tela de Relatórios.
6. Painel dedicado de Analytics de Funil (won/lost/conversion na aba Relatórios).
7. Filtro por membro / funil na tela de Relatórios.
8. Export XLSX / PDF / relatórios agendados / BI externo (Looker/PowerBI).
9. Cohort / attribution / analytics preditivo / IA de insights.

---

## 22. Veredito

**RELATÓRIOS / ANALYTICS INTERNALLY COMPLETE / FROZEN**
CRITICAL = 0, HIGH = 0 (o HIGH histórico de CSV injection foi corrigido nesta missão).
