# PROJECT FINALIZATION CHECKPOINT

**Missão:** PROJECT-FINALIZATION-CHECKPOINT-01
**Data:** 2026-07-19
**Modo:** READ-ONLY (nenhum código alterado)
**Fontes cruzadas:** código atual, banco atual (Supabase), migrations (55), rotas (34+), server functions (263+), providers, testes (33 arquivos, 309/314 PASS), Guardian (21 incidents abertos), auditorias FB-10.x e master-audit.

---

## 1. Estado geral (dados reais do banco em 2026-07-19)

| Superfície | Valor real | Interpretação |
|---|---|---|
| Companies (tenants) | 1 | Piloto WebMarcas único |
| Users / profiles | 1 | Operador único |
| AI agents | 1 | Agente ativo |
| Contacts | 3 | Volume de teste |
| Conversations | 3 | Volume de teste |
| Messages | 135 (todas nos últimos 7 dias) | Uso ativo, porém 100% mock |
| Flows | 2 (1 publicado) | Runtime exercitado |
| Flow runs | 7 completed / 0 failed / 0 waiting | Runtime saudável |
| Flow DLQ | **0** | Sem dead letters |
| Guardian incidents abertos | **21** (19 Medium + 2 High) | Hygiene frontend acumulada |
| **Canais reais** | **0** | **2 canais existem, ambos `provider='mock'`** |

**Conclusão factual:** a plataforma **existe, executa e persiste corretamente**, mas **nunca trocou uma mensagem WhatsApp real com o mundo externo**. O gargalo entre "pronta internamente" e "operacional" é a ausência de canal Cloud real conectado — não é código faltando.

---

## 2. Inventário de módulos e maturidade

Legenda: **A** Production Ready · **B** Internally Ready / Pending External · **C** Functional but Incomplete · **D** Partial · **E** Scaffold · **F** Not Implemented · **G** Post-V1.

| # | Módulo | Nível | Evidência principal | Gap crítico V1 (WebMarcas) |
|---|---|:-:|---|---|
| A | Autenticação | A | `handle_new_user`, invites, HIBP, OAuth Google broker | — |
| B | Empresas / Tenants | A | `companies`, `current_company_id`, invite→profile | — |
| C | Equipe | A | 8 rotas team, invites, roles, presença | Filas/agenda subutilizadas (Post-V1) |
| D | RBAC / Permissões | A | `has_role`, `has_permission`, matriz por role, overrides | — |
| E | CRM (contatos, tags, notas, tarefas, custom fields) | A | Rota `crm.index` + perfil (650 LOC), enrichment, kanban | Presets INPI ausentes |
| F | Kanban / Pipeline | A | Kanban no CRM, stages, drag&drop | Pipeline Marcas & Patentes ausente |
| G | Inbox — texto/áudio/reply/forward/pin/copy/message-info | A | `inbox.$conversationId.tsx` 1245 LOC | — |
| H | Inbox — imagem/vídeo/documento | B | Código completo | Não exercitado em produção real |
| I | Inbox — marcar não lida / arquivar / buscar-na-conversa / info drawer / seleção múltipla | D | Parcial | **5 ações UX faltando** |
| J | Canais (config UI, QR, sparkline) | A | `channels.tsx` (350 LOC), 26 colunas em `channels` | — |
| K | WhatsApp Cloud Provider | **B** | `wa-providers/whatsapp-cloud.server.ts`, webhook com assinatura HMAC (`whatsapp.$channelId.ts`), delete, PTT, ACK | **Zero canal real conectado — 2 canais mock** |
| L | Flow Builder | **B** | **CONGELADO** — 21 kinds, 309/314 testes | Provider Acceptance externo |
| M | Runtime Engine | A | Canônico validado, lock TTL, DLQ, 7/7 runs completed | — |
| N | Scheduler | A | `/api/public/cron/*` + pg_cron 60s + heartbeats | — |
| O | WAIT / Resume | A | `flow_run_acquire_lock`, `paused_until`, resume | — |
| P | WAIT_REPLY | A | `resumeWaitingReplyForConversation` no webhook | — |
| Q | DLQ | A | Tabela + observabilidade; **0 rows atuais** | — |
| R | Guardian | C | Alerter, dedup, rate-limit, snapshots | **21 incidents abertos + 5 falhas de teste** |
| S | Agentes IA | A | `ai_agents` (29 cols, 5 policies), knowledge, prompt versions | Sem timeout no gateway (Post-V1) |
| T | AI Gateway | A | Lovable AI Gateway plugado em `aiNode` e `agent-studio` | — |
| U | Automação (Cascatas + Broadcasts) | A | 24 cols em `broadcasts`, cascade tick funcional | Sem uso real |
| V | Integrações/API pública | A | 9 rotas `/api/public/*` (webhook WhatsApp, cron cascade, flow-resume, healths) | — |
| W | Storage / Mídia | A | 4 buckets privados, message-media exercitado | Batch `signMany` pendente (Perf) |
| X | Configurações | A | 5 rotas settings (audit, feature-flags, features, geral) | Consolidar `features` × `feature-flags` (2 telas duplicadas) |
| Y | Billing / Planos / Admin Master | **F** | `plan_limits` + `subscriptions` existem sem enforcement | **Não bloqueia WebMarcas; bloqueia SaaS** |
| Z | Observabilidade | A | `flow_run_steps`, `flow_events`, `domain_events`, audit log | — |
| AA | Segurança | B | RLS 100%, SSRF corrigido, HIBP, RBAC | `exec_read_sql` blindada mas ainda DEFINER superfície |
| AB | Operações / Deploy | C | Publish Lovable + healthchecks públicos | Retenção pg_cron ausente (30d); DR não documentado |
| AC | Onboarding | D | `onboarding_progress` + presets `handle_new_user` | Não guia end-to-end |
| AD | Notificações UI | D | `notification_preferences` estrutura | UI push/toast persistente ausente (Post-V1) |
| AE | Mobile | A | Cobertura ampla (missões mobile-01..06.4 concluídas) | — |

---

## 3. Flow Builder V1

**Nível: B — INTERNALLY PRODUCTION READY / PENDING PROVIDER ACCEPTANCE.**

- Congelado formalmente em `docs/audits/flow-builder/FLOW-BUILDER-V1-FREEZE.md` (2026-07-19).
- 21 kinds operacionais, zero Critical, zero High, regressão 309/314 (5 pré-existentes Guardian não-FB).
- **Não reauditado nesta missão** conforme regra do checkpoint.
- Única pendência: Provider Acceptance com canal Cloud real.

---

## 4. Guardian — análise das falhas

### 4.1 Testes (5 falhas em `guardian-alerter.test.ts`)
- **Root cause:** uso de `vi.stubGlobal` (API Vitest) sob runner **Bun test**.
- **Impacto real:** nenhum — o código de produção do alerter funciona (`guardian-alerter.server.ts`); apenas a suite não roda no runner atual.
- **Severidade:** LOW / Post-V1 (migrar Vitest ou reescrever com API Bun).

### 4.2 Incidents abertos (21 no banco)
- **2 HIGH** — cada um com 1 ocorrência: `N.map is not a function` (lista de quick-replies) e `k.filter is not a function`. Ambos são **defensive-programming misses** no frontend quando o hook retorna `undefined`/objeto em vez de array. Reproduzíveis, corrigíveis em ≤1h cada.
- **19 MEDIUM** — três padrões recorrentes:
  1. `cannot add postgres_changes callbacks... after subscribe()` (10 ocorrências) — ordem de registro de handler realtime; erro higiênico frontend.
  2. `useMobileFab must be used inside MobileFabProvider` (7 ocorrências) — Provider mount incorreto em rotas mobile.
  3. `Minified React error #418` (6 ocorrências) — hidratação SSR/CSR divergente.

**Classificação:** hygiene de frontend acumulada por iterações rápidas. Não bloqueia operação, mas contamina o painel Guardian e degrada UX. **Merece uma etapa dedicada de estabilização.**

### 4.3 Alerter externo
- Código, dedup por fingerprint, rate-limit e severidade mínima **funcionais** em produção; apenas os testes não rodam sob Bun.

---

## 5. Segurança — Critical/High abertos

- **Critical: 0.**
- **High: 0** (SSRF HIGH-1/2/3 fechados no Final Gate do Flow Builder).
- `exec_read_sql`: blindada (transaction read-only + regex + single-statement) mas continua superfície DEFINER — decisão do master plan é substituir por whitelist antes do RC comercial (item SaaS, não WebMarcas).

---

## 6. Performance

- **F-01 (Inbox cold-load ~9s)**: friccional, documentado. Alvo definido em `RELEASE_1.0_MASTER_PLAN.md` é <3s via `signMany` batch + auth cache + `Promise.all` no boot + bundle split.
- **F-05 (N+1 `getMediaUrl`)**: batch pendente. Baixo custo.
- Runtime saudável (0 DLQ, 7/7 runs completed, WAIT resume validado em produção).

---

## 7. DLQ / Scheduler / Storage

- DLQ 0 rows. Scheduler pg_cron 60s ativo (heartbeats). WAIT resume validado. Storage: 4 buckets privados. **Zero bloqueadores V1.**

---

## 8. Distinção obrigatória: WebMarcas × SaaS

### 8.1 WebMarcas Operation Ready
**Definição:** a própria WebMarcas opera Zenda como sistema único no dia a dia.

**Pode operar hoje?** **NÃO** — bloqueio duro: **nenhum canal WhatsApp Cloud real conectado**. Todas as 135 mensagens dos últimos 7 dias foram sobre canal mock. Sem canal real, a WebMarcas não substitui o WhatsApp paralelo.

**Bloqueadores (P0/P1):**

| ID | Área | Problema | Sev | Estimativa | Dep |
|---|---|---|:-:|---|---|
| B-WM-01 | Provider | Zero canal WhatsApp Cloud real conectado | P0 | 1d | Credenciais Meta WebMarcas |
| B-WM-02 | Flow Builder | Provider Acceptance externo pendente (herdada do freeze) | P0 | 1d | B-WM-01 |
| B-WM-03 | Guardian | 2 HIGH abertos (`N.map`/`k.filter`) — defensive misses no frontend | P1 | 0.5d | — |
| B-WM-04 | Inbox UX | 5 ações V1 faltando (marcar não lida, arquivar, buscar na conversa, info drawer, seleção múltipla + ações lote) | P1 | 3d | — |
| B-WM-05 | Presets WebMarcas | Custom fields INPI + pipeline Marcas & Patentes + quick replies + tags + 1 fluxo template | P1 | 2d | — |
| B-WM-06 | Guardian | 19 Medium recorrentes (realtime ordering, MobileFab, hydration #418) contaminam painel | P1 | 1.5d | — |
| B-WM-07 | Perf Inbox | Cold-load ~9s → alvo <3s (`signMany` + auth cache + bundle split) | P1 | 2d | — |
| B-WM-08 | Validação operacional | Ausência de RC-00 assinado (1 dia útil operação real WebMarcas dentro do sistema) | P1 | 1d | B-WM-01..07 |

**Total:** **8 bloqueadores** (2 P0, 6 P1). **Estimativa 11–13 dias úteis.**

### 8.2 SaaS Commercial Ready
**Definição:** novos tenants entram, configuram, pagam e operam com isolamento e onboarding adequado.

**Pode operar hoje?** **NÃO — muito longe.** Sem billing, sem self-service, sem onboarding guiado, sem admin master, sem multi-canal externo.

**Bloqueadores (P2):**

| ID | Área | Problema | Estimativa |
|---|---|---|---|
| B-SA-01 | Onboarding | Wizard end-to-end (criar empresa → convidar equipe → conectar canal → primeiro fluxo) | 3d |
| B-SA-02 | Provider self-service | UI para operador conectar Cloud próprio (App ID, App Secret, verify token, webhook URL, phone number ID) | 2d |
| B-SA-03 | Billing | Stripe **ou** Asaas + `plan_limits` enforcement (por company: canais, mensagens, agentes, fluxos, storage) | 5d |
| B-SA-04 | Admin Master | Painel para operar tenants (listar, suspender, ver métricas, forçar plano) | 3d |
| B-SA-05 | Retenção | pg_cron TTL 30d para `guardian_*`, `flow_events`, `flow_run_steps`, `channel_events` | 1d |
| B-SA-06 | Segurança | Substituir `exec_read_sql` por whitelist + revogar EXECUTE amplos + suíte RLS por tabela crítica | 2d |
| B-SA-07 | Multi-canal | Instagram Direct, Facebook Messenger, Email provider (mínimo 1 adicional) | 5d |
| B-SA-08 | Staging + DR | Ambiente staging separado + runbook backup/restore + `docs/ops/DISASTER_RECOVERY.md` | 3d |
| B-SA-09 | UX walkthrough | 10 rotas críticas revisadas para operador externo (não WebMarcas) | 2d |
| B-SA-10 | Design System audit | Consolidar botões/modais/toasts/loading/empty-states | 2d |

**Total:** **10 bloqueadores** (todos P2). **Estimativa adicional 28–32 dias úteis.**

---

## 9. Respostas obrigatórias

| # | Pergunta | Resposta |
|:-:|---|---|
| 1 | A plataforma pode ser usada hoje internamente pela WebMarcas? | **PARCIAL** — código sim, operação real não (sem canal WhatsApp real) |
| 2 | Se não, quais são os bloqueadores exatos? | Ver seção 8.1 (8 itens) |
| 3 | Qual é o próximo módulo que deve receber desenvolvimento? | **Provider WhatsApp Cloud real + Provider Acceptance** (Etapa 3 do roadmap) — precedido de estabilização Guardian (Etapa 1) e Presets+UX (Etapa 2) |
| 4 | WhatsApp Cloud é o maior bloqueador externo? | **SIM.** Único gate P0 restante para WebMarcas. |
| 5 | CRM atual é suficiente para V1 WebMarcas? | **SIM funcionalmente**, faltam **presets Marcas & Patentes** (fino, 2d) |
| 6 | Inbox atual é suficiente para V1 WebMarcas? | **PARCIAL** — 5 ações UX faltam (B-WM-04) |
| 7 | Agentes IA suficientes para V1? | **SIM** (timeout no gateway → Post-V1) |
| 8 | Equipe/RBAC suficientes para V1? | **SIM** (nível A) |
| 9 | Guardian operacional? | **SIM** (alerter + dedup + snapshots) mas com **21 incidents acumulados** (2 High) que precisam ser limpos |
| 10 | Scheduler/DLQ operacionais? | **SIM** (DLQ=0, cron 60s, heartbeats) |
| 11 | Critical abertos? | **0** |
| 12 | High abertos? | **2** (frontend Guardian: `N.map`, `k.filter`) |
| 13 | Etapas até WebMarcas Operation Ready? | **4** (ver §10) |
| 14 | Etapas adicionais até SaaS Commercial Ready? | **4** |
| 15 | Estimativa total realista? | WebMarcas **11–13 dias úteis** · SaaS adicional **28–32 dias úteis** |

---

## 10. Roadmap finito (visão geral — detalhado em documentos separados)

### Fase WebMarcas — 4 etapas até `FINAL GATE: WEBMARCAS OPERATION READY`

1. **W1 — Estabilização Guardian + Frontend** (2d) → zera 2 High, limpa 19 Medium.
2. **W2 — Presets WebMarcas + Inbox UX V1** (5d) → custom fields INPI, pipeline, quick replies, 1 fluxo template + 5 ações Inbox.
3. **W3 — Perf Inbox + Provider Acceptance** (4d) → cold-load <3s, `signMany`, conectar canal real, executar Provider Acceptance completo.
4. **W4 — RC WebMarcas Operation Lock** (1d) → operação real 1 dia útil + relatório assinado.
5. **FINAL GATE — WEBMARCAS OPERATION READY.**

### Fase SaaS — 4 etapas adicionais até `FINAL GATE: SAAS COMMERCIAL READY`

1. **S1 — Onboarding + Self-service Provider + Admin Master** (7d)
2. **S2 — Billing + `plan_limits` enforcement** (5d)
3. **S3 — Segurança comercial + Retenção + Staging + DR** (6d)
4. **S4 — Multi-canal (Instagram/Email) + UX/Design audit** (9d)
5. **FINAL GATE — SAAS COMMERCIAL READY.**

Detalhamento: [`WEBMARCAS-OPERATION-READY-ROADMAP.md`](./WEBMARCAS-OPERATION-READY-ROADMAP.md) e [`SAAS-COMMERCIAL-READY-ROADMAP.md`](./SAAS-COMMERCIAL-READY-ROADMAP.md).

---

## 11. Percentual estimado do projeto

| Escopo | Concluído | Nota |
|---|---|---|
| Núcleo funcional (Auth, RBAC, CRM, Inbox base, Runtime, Flow Builder, Guardian, Storage, Providers de código) | **~95%** | Reforçado pela conclusão do FB V1 |
| WebMarcas Operation Ready | **~85%** | Falta canal real + presets + 5 UX + perf + estabilização Guardian |
| SaaS Commercial Ready | **~55%** | Falta billing, onboarding, admin master, self-service, multi-canal, DR |

---

## 12. Regras do congelamento herdadas

- Flow Builder V1 permanece **CONGELADO**. Nenhuma etapa deste roadmap toca kinds, runtime do FB ou registry. Provider Acceptance é escopo cirúrgico (W3), sem novos blocos.
- Toda etapa termina com: relatório + evidência + decisão explícita **Encerrada** ou **Bloqueada**.
- Critical/High comprovados sempre podem ser corrigidos; Medium/Low sempre vão para backlog Pós-V1.

---

## 13. Documentos deste checkpoint

- `docs/finalization/PROJECT-FINALIZATION-CHECKPOINT.md` (este)
- `docs/finalization/WEBMARCAS-OPERATION-READY-ROADMAP.md`
- `docs/finalization/SAAS-COMMERCIAL-READY-ROADMAP.md`
- `docs/finalization/PROJECT-FINALIZATION-EXECUTIVE-SUMMARY.md`

Referências: `docs/RELEASE_1.0_MASTER_PLAN.md`, `docs/audits/master-audit/final-status.md`, `docs/audits/flow-builder/FLOW-BUILDER-V1-FREEZE.md`.
