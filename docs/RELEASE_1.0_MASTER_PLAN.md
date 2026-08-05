# RELEASE 1.0 — MASTER PLAN

> Documento oficial e único de fechamento da versão 1.0.
> Substitui todos os roadmaps anteriores (INBOX-UX-01, Fase 2, Fase 3+, backlogs Medium/Low).
> Nenhum código foi alterado nesta emissão. Nenhuma missão está aprovada.
> Autor lógico: CTO responsável pelo lançamento.
> Emissão: 2026-07-17.

---

## 0. Reposicionamento estratégico (base de todas as decisões abaixo)

A recomendação do usuário é acatada como diretriz oficial:

> **Zenda deixa de ser tratada como "SaaS omnichannel genérico" na v1.0. A versão 1.0 é a plataforma operacional da WebMarcas — atendimento, CRM e automações no dia-a-dia real de marcas e patentes. SaaS multi-tenant genérico fica para v2.**

Consequências diretas neste plano:
1. **Nada de novos providers** (Facebook, Instagram, Email, SMS) na v1.0. WhatsApp Cloud é o único canal suportado — é o que a WebMarcas usa.
2. **Nada de billing/monetização** na v1.0 — não há cliente pagante externo. Enforcement de `plan_limits`, Stripe e Asaas ficam para v2.
3. **Diferencial de domínio (Marcas & Patentes) entra na v1.0** como camada fina sobre CRM (custom fields dedicados + pipeline dedicado + quick replies de domínio). Não é módulo novo — é configuração + presets.
4. **Governança "evidência antes de código" mantida** — mas o gatilho para v1.0 é uma checklist objetiva de aceite, não relatos avulsos.

---

## 1. Inventário oficial do que existe

Legenda: **✅ Concluído** · **🟡 Parcial** · **🔴 Incompleto** · **⚫ Desnecessário v1.0** · **♻️ Duplicado**

### 1.1 Módulos de produto

| Módulo | Status | Nota v1.0 | Observação |
|---|---|:-:|---|
| Auth (login, cadastro, OAuth Google, invite) | ✅ | 9 | Password HIBP ativo; convites por token; solidez comprovada |
| RBAC / Permissões | ✅ | 9 | `has_role`/`has_permission` SECURITY DEFINER; overrides por membro; matriz por role |
| Team (membros, filas, departamentos, presença) | 🟡 | 7 | Presença e agenda subutilizadas; filas não integradas ao roteamento do Inbox |
| CRM (contatos, tags, notas, tarefas, custom fields, enrichment) | ✅ | 8 | Views lista/cards/kanban; import CSV; enrichment com aprovação |
| Inbox — texto/áudio | ✅ | 8 | Envio, recebimento, reply nativo Cloud, forward, copy, message-info, pin |
| Inbox — imagem/documento/vídeo | 🟡 | 6 | Código suporta; **0 uso real em produção** — não exercitado |
| Inbox — busca dentro da conversa | 🔴 | 4 | Não existe UI; só busca em lista de conversas |
| Inbox — marcar como não lida / arquivar / silenciar | 🔴 | 3 | Campos/colunas parciais; UI ausente |
| Inbox — selecionar múltiplas | 🟡 | 6 | Existe `selection-toolbar.tsx`; ações limitadas |
| WhatsApp Cloud (provider) | ✅ | 9 | Send + inbound + ack; **canal real ainda não conectado no banco (2 mocks)** |
| Fluxos (Studio) | ✅ | 8 | React Flow, block library, properties panel, test drawer, analytics |
| Runtime Engine | ✅ | 9 | Canônico, WAIT via pg_cron, DLQ, lock otimista, paridade Simulador×Produção validada |
| Agentes IA (Studio + Playground + nó `ai` em fluxo) | ✅ | 8 | AI Gateway, versões de prompt, knowledge docs, logs |
| Guardian | ✅ | 9 | Snapshots, incidentes, alerter externo, dedup, rate-limit |
| Dashboard (widgets) | 🟡 | 7 | KPIs OK; **AI Summary marcado `experimental`** — decidir manter ou remover |
| Reports (Broadcasts, Cascades, Conversations) | 🟡 | 6 | Rotas presentes; qualidade dos dados depende de operação real |
| Campanhas / Broadcasts | ✅ | 7 | Wizard, status; sem uso real ainda |
| Cascatas (retry/policy) | ✅ | 7 | Cron tick funcionando; não exercitado em volume |
| Canais (config, QR, sparkline) | ✅ | 8 | UI pronta; só conectar canal real |
| Quick Replies | ✅ | 8 | Folders + shortcuts; presets iniciais criados em `handle_new_user` |
| Onboarding | 🟡 | 5 | `onboarding_progress` existe; checklist básico; não guia end-to-end |
| Notificações UI | 🔴 | 3 | `notification_preferences` estrutura; sem push/toast persistente |
| Feature flags | ✅ | 7 | Painel administrativo; usar com parcimônia |
| Audit log | ✅ | 8 | `team_audit_log` + `team_entity_history` populados via triggers |
| Settings (features, feature-flags, audit, guardian, APIs) | ✅ | 8 | Painéis organizados |
| Storage (4 buckets) | ✅ | 8 | Todos privados; `agent-knowledge` e `contact-files` com uso baixo |
| Mobile (todos módulos) | ✅ | 7 | Cobertura ampla; alguns sheets ainda com paridade parcial |

### 1.2 Módulos ausentes / não iniciados

| Módulo | Decisão v1.0 |
|---|---|
| Facebook / Instagram provider | ⚫ Fora do escopo v1.0 |
| Email provider (envio real) | ⚫ Fora do escopo v1.0 |
| SMS provider | ⚫ Fora do escopo v1.0 |
| Financeiro / Stripe / Asaas | ⚫ Fora do escopo v1.0 |
| Agenda completa (team_schedules) | ⚫ Simplificar/adiar |
| Marketplace / plugins | ⚫ Fora do escopo v1.0 |
| Domain events com subscribers | ⚫ Remover ou congelar (0 uso) |
| Funil (`funnels` route) | 🟡 Auditar: é usado? Se não, remover |

### 1.3 Diferencial WebMarcas (Marcas & Patentes) — a criar como configuração

Não é módulo novo. É **preset de domínio** sobre o que já existe:
- **Custom fields dedicados** em `contacts`: `processo_inpi`, `numero_processo`, `classe_nice`, `titular`, `data_deposito`, `status_inpi`, `procurador`.
- **Pipeline dedicado** (kanban CRM): `Prospecção → Pedido depositado → Exame → Publicação → Concessão → Manutenção`.
- **Quick replies presets** de domínio (10–15 respostas típicas: exigência, publicação, taxa, renovação).
- **Tags obrigatórias**: `Marca`, `Patente`, `Renovação`, `Exigência`, `Publicação`.
- **1–2 fluxos template**: "Notificar publicação" e "Cobrança de renovação anual".

Custo: baixo (dados + seed + 1 tela de configuração no CRM). Ganho: v1.0 vira produto real, não protótipo genérico.

---

## 2. Correções obrigatórias (backlog consolidado, com decisão)

Cada item abaixo tem **decisão explícita** (Manter / Simplificar / Remover / Unificar) e prioridade v1.0.

### 2.1 Bugs / High operacionais

| ID | Item | Decisão | RC/1.0/Pós |
|---|---|:-:|:-:|
| RT-H-01 | `provider_message_id` NULL em mensagens placeholder | Manter → corrigir | **RC** |
| RT-H-02 | `deleteFlow` gera órfãos em `flow_run_steps/events/dlq/versions` | Manter → transacional | **RC** |
| RT-H-03 | `saveFlowGraph` sem transação | Manter → transacional | **RC** |
| DB-H-02 | Retenção `guardian_health_snapshots`/`guardian_runs` | Manter → pg_cron TTL 30d | **1.0** |
| DB-H-03/EVT-H-01 | Retenção `flow_events`/`flow_run_steps` TTL 30d | Manter → pg_cron | **1.0** |
| SEC-H-02 | 12 funções DEFINER com EXECUTE amplo | Manter → revogar EXECUTE onde possível | **RC** |
| ARCH-H-01 | 43 arquivos no topo de `src/lib/` | Simplificar → agrupar em `flows/`, `inbox/`, `crm/`, `guardian/`, `runtime/`, `platform/` | **1.0** |
| OBS-H-02 | Dashboard consolidado de saúde | Simplificar → widget único em Settings/Guardian | **1.0** |
| F-01 | Cold-load Inbox ~9s | Manter → alvo <3s (bundle split + auth cascade + prefetch) | **1.0** |
| F-05 | N+1 em `getMediaUrl` | Manter → batch `signMany(ids[])` | **RC** |
| F-02 | Incidents antigos de realtime | Simplificar → limpar `guardian_incidents` histórico ao entrar em RC | **RC** |

### 2.2 UX obrigatórios v1.0 (Inbox)

Apenas o que impacta operador real. Grupos B/C/D do roadmap INBOX-UX-01 revistos:

| Ação | Grupo original | Decisão v1.0 |
|---|:-:|:-:|
| Marcar como não lida | B | **Manter (RC)** |
| Arquivar conversa | B | **Manter (RC)** |
| Silenciar conversa | B | **Simplificar → Pós-1.0** |
| Info da conversa (drawer com contato + canal + tags) | B | **Manter (1.0)** |
| Selecionar múltiplas + ações em lote (arquivar/marcar) | B | **Manter (1.0)** |
| Reagir a mensagem (emoji) | C | **Remover (Pós-1.0)** — não crítico WebMarcas |
| Buscar dentro da conversa | C | **Manter (1.0)** — atendimento jurídico precisa |
| Encaminhar múltiplas mídias | C | **Manter (1.0)** |
| Chamadas / Status / Comunidades | D | **Remover** — limitação Cloud, não faz sentido |

Paridade projetada v1.0 = **~78%** (suficiente para WebMarcas; teto Cloud 91% fica para v2).

### 2.3 Segurança

Executar **nova auditoria** completa antes do RC via `security--run_security_scan`. Além disso:
- `exec_read_sql`: **substituir por whitelist de queries nomeadas** ou revogar EXECUTE de `authenticated` (SEC-H-01 mitigada mas ainda superfície DEFINER).
- Rotação de secrets: documentar cadência semestral (OPS-H-02).
- Cobertura de testes de RLS ampliada por tabela crítica (`messages`, `conversations`, `contacts`, `flow_runs`).

### 2.4 Arquitetura

- Reorganizar `src/lib/` em subdomínios (ARCH-H-01).
- Consolidar contratos Zod em `src/lib/contracts/` (API-M-01).
- Adotar `AppError` (ADR-005) em 100% das server fns públicas (API-M-02).
- Remover `domain_events` da API (0 consumidores, 0 registros) **OU** ativar 1 consumidor real (Guardian). Decisão v1.0: **remover da API pública, manter tabela para v2**.

### 2.5 Responsividade

- Auditar 6 rotas críticas (Inbox, CRM, Fluxos, Agentes, Dashboard, Settings) em desktop 1440, laptop 1280, tablet 1024, mobile 390. Documentar diffs, corrigir só o que quebra fluxo.

---

## 3. Remoções (redução de superfície)

Objetivo: **cortar 20–30% da complexidade** antes do RC.

### 3.1 Rotas / módulos candidatos a remoção

| Item | Motivo | Ação |
|---|---|---|
| `_authenticated.funnels.tsx` | Não referenciado no sidebar principal; sobrepõe kanban do CRM | **Remover se sem uso** |
| `_authenticated.settings.feature-flags.tsx` **e** `_authenticated.settings.features.tsx` | 2 rotas sobrepostas | **Unificar em uma** |
| `_authenticated.reports.tsx` layout + `_authenticated.reports.index.tsx` | Index redundante | **Auditar; unificar se for redirect** |
| Widget `ai-summary` (`experimental`) | Marcado experimental, sem uso operacional | **Remover ou promover** — decidir |
| Bucket `agent-knowledge` | Uso baixo se RAG não é exercido | **Manter apenas se agente WebMarcas usar RAG real** |
| Bucket `contact-files` | Sem uso conhecido | **Auditar; remover se 0 arquivos** |
| `domain_events` API pública | 0 consumidores, 0 rows | **Remover endpoints; congelar tabela** |
| Mocks de canal (2 registros em `channels`) | Piloto ainda em mock | **Substituir por canal Cloud real antes do RC** |
| `email-ai.functions.ts` / `email-ai-dialog.tsx` | Email não é escopo v1.0 | **Remover ou ocultar por feature flag off** |
| `agent_test_sessions` | Se não usado além do Playground | **Auditar; manter só se ativo** |

### 3.2 Relatórios duplicados em `docs/audits/inbox/`

Existem 3 arquivos sobre A5 Pin: `INBOX-UX-01-A5-pin-report.md`, `-final-report.md`, `-regression-report.md`. **Consolidar em um único** relatório canônico.

### 3.3 Migrations obsoletas

55 migrations em 4 dias (2026-07-13 → 2026-07-17) indica iteração intensa. **Não squashar em produção**, mas gerar `docs/migrations.md` consolidado listando o que cada bloco de migrations entregou (para auditoria futura).

### 3.4 Código morto — protocolo de detecção

Rodar antes do RC:
- `bunx knip` (import/export não usados)
- `bunx tsgo --noEmit` (tipos órfãos)
- `rg "export (function|const)" src/lib/` cruzado com uso — remover exports sem consumidor.

---

## 4. Padronização (Design System)

O `docs/design/design-system-v2.md` existe. Consolidar em uma **passada única** antes do RC:

| Superfície | Padrão v1.0 |
|---|---|
| Botões | `Button` shadcn + 4 variants (`default`, `outline`, `ghost`, `destructive`); sem custom variants em componentes |
| Modais / Drawers / Sheets | 1 componente por finalidade (nunca ambos para o mesmo caso); mobile = `Sheet`, desktop = `Dialog`/`Drawer` |
| Toasts | `sonner` exclusivo (banir `Toaster` customizado se houver) |
| Loading | 3 padrões: `Skeleton` (listas), `Spinner` (ações), `Progress` (uploads). Nada além |
| Empty states | Componente único `<EmptyState icon title description action>` |
| Errors | Componente único `<ErrorState>` + boundary global; nunca `try/catch` silencioso |
| Ícones | `lucide-react` exclusivo, sem SVGs inline |
| Cores | 100% via CSS tokens (`--primary`, `--muted`, etc.); banir `bg-white`, `text-black` em componentes |
| Tipografia | 1 display + 1 body definidos em `styles.css` |
| Espaçamento | Grid de 4px (Tailwind default); banir `px-[13px]` etc. |

Entrega: **1 documento de auditoria** `docs/design/design-audit-v1.0.md` listando desvios encontrados + correções.

---

## 5. UX por tela (varredura obrigatória antes do RC)

Não listar 33 rotas aqui. Regra: cada rota da lista abaixo passa por 3 perguntas — **o que melhora, o que atrapalha, o que remove**.

**Rotas críticas (obrigatórias no RC):**
1. `/inbox` (lista + conversa)
2. `/crm` (lista + perfil)
3. `/flows` (lista + studio)
4. `/agents` (lista + detalhe)
5. `/dashboard`
6. `/channels`
7. `/team` (lista + perfil)
8. `/settings/*`
9. `/auth`
10. `/invite/:token`

**Rotas secundárias (aceitáveis com débito):**
Campanhas, Cascades, Reports, Quick Replies, Funnels (se sobreviver).

Entrega: `docs/audits/release-1.0/UX_WALKTHROUGH.md` com 1 seção por rota.

---

## 6. Performance — alvos v1.0

| Métrica | Baseline | Alvo v1.0 | Como |
|---|---|---|---|
| Inbox cold-load (desktop) | ~9,0 s | **< 3,0 s** | Bundle split por rota, `auth.getUser()` 1× por sessão, `Promise.all` no boot, prefetch via TanStack Query |
| `getMediaUrl` por conversa | N chamadas | **1 chamada batch** | `signMany(ids[])` |
| Envio de mensagem (E2E) | ~n/d | **< 800 ms p95** | Medir; otimizar se falhar |
| WAIT resume | <2 s | Manter | Já validado |
| DLQ | 0 | Manter em 0 | Alerta Guardian em >0 |
| Bundle inicial | ~n/d | **< 250 KB gzip** | Análise `vite-bundle-visualizer` |
| First contentful paint (auth) | ~n/d | **< 1,5 s** | SSR + code split |

**Backend:**
- Ativar `pg_stat_statements` e capturar p50/p95 semanal.
- Remover 30 índices ociosos após 30 dias de operação real (não antes).
- Autovacuum tuning em `flow_runs`, `conversations`, `messages`, `channel_metrics_daily`.

**Realtime:**
- Auditar canais Supabase Realtime abertos por página; garantir 1 subscription por escopo, desmontar limpo.

---

## 7. Segurança — checklist RC

Nova varredura obrigatória (não confiar em auditoria anterior):
1. `security--run_security_scan` — zero Critical, zero High aceito.
2. `exec_read_sql` substituída por whitelist.
3. HIBP ativo (confirmar).
4. RLS testado por script em cada tabela user-facing (SELECT, INSERT, UPDATE cross-tenant devem falhar).
5. GRANTs auditados — nenhum `anon` em tabela sensível.
6. Storage: URLs assinadas com TTL curto; verificar bucket policies.
7. Secrets: rotação documentada; nenhum log expõe token/JWT.
8. Rate-limit em `/api/public/*` (webhooks WhatsApp especialmente).

---

## 8. Banco — checklist RC

| Item | Ação |
|---|---|
| Índices | Rodar `pg_stat_user_indexes` → remover ociosos após 30d de operação |
| Constraints | Verificar FKs `ON DELETE` explícitas (cascade x set null) em tabelas relacionadas a `messages` e `flow_runs` |
| RLS | 100% ativa (já confirmado) — cobrir testes automatizados |
| Policies | Cada tabela: SELECT + INSERT + UPDATE + DELETE explícitos por `authenticated`; nenhum policy `USING (true)` sobrevive |
| Migrations | Documentar `docs/migrations.md` consolidado |
| Retenção | pg_cron TTL 30d para `guardian_*`, `flow_events`, `flow_run_steps`, `channel_events`, `domain_events` |
| Extensões | Mover extensões de `public` para schema `extensions` (DB-M-06) |
| Backup | Confirmar snapshots automáticos Lovable Cloud; documentar RPO/RTO em `docs/ops/DISASTER_RECOVERY.md` |

---

## 9. Runtime — checklist RC

Já validado em RUNTIME-PARITY. Apenas confirmar:
- [x] Scheduler pg_cron ativo (30s) — validar heartbeat < 60s
- [x] WAIT persistente + resume via `/api/public/flow-resume`
- [x] DLQ com dashboard de replay
- [x] Executor único canônico
- [x] Retry: cascade separada, sem retry no runtime
- [ ] **Corrigir RT-H-01, RT-H-02, RT-H-03**
- [ ] Testes E2E: fluxo mínimo Start→Msg→End + fluxo WAIT + fluxo AI + fluxo error path (DLQ)

---

## 10. Guardian — checklist RC

- [x] Health snapshots + score
- [x] Alerter externo (webhook Slack/Discord)
- [x] Dedup por fingerprint + rate-limit
- [ ] Retenção snapshots (DB-H-02)
- [ ] Dashboard consolidado 1 tela (OBS-H-02)
- [ ] Limpar 20 incidents históricos antes do RC (higiene)
- [ ] Alertar quando `domain_events` volume>0 (se sobreviver) ou DLQ>0

---

## 11. IA — checklist RC

| Item | Ação |
|---|---|
| Prompts | Versionados em `agent_prompt_versions` ✅ — auditar prompts atuais |
| Contexto | Confirmar payload máximo por request (`agent_logs.tokens_in`) — alertar >8k |
| Custos | Definir orçamento mensal WebMarcas; Guardian alerta se >80% |
| Latência | p95 < 5s; se >8s, degradar para modelo mais rápido |
| Erros | Fallback: se Gateway falhar, agente responde `"Estou processando. Um humano continuará."` + notifica |
| Fallbacks | Nó `ai` em fluxo com timeout 15s → branch de erro |
| Presets WebMarcas | 1 agente pré-configurado: `Assistente Marcas & Patentes` com knowledge docs INPI |

---

## 12. CRM — jornada WebMarcas (validação obrigatória)

Fluxo canônico validado em produção **com dados reais WebMarcas** antes do RC:
1. Lead entra por WhatsApp → `contact` criado automaticamente → tag `Lead`.
2. Operador qualifica → move no kanban `Prospecção → Pedido depositado`.
3. Custom fields de processo (numero_processo, classe_nice, data_deposito) preenchidos.
4. Timeline mostra mensagens + notas + tarefas + eventos INPI.
5. Fluxo "Notificar publicação" dispara → mensagem WhatsApp → registra ack.
6. Renovação futura: tarefa agendada + fluxo de cobrança 30 dias antes.

**Aceite:** um contato real da WebMarcas percorre 100% do funil sem intervenção técnica.

---

## 13. Inbox — checklist experiência

- [x] Enviar/receber texto, áudio
- [ ] Enviar/receber imagem, documento (**testar com dados reais**)
- [x] Reply nativo
- [x] Forward
- [x] Copy
- [x] Message info
- [x] Pin (limite 3)
- [ ] **Marcar como não lida**
- [ ] **Arquivar**
- [ ] **Buscar dentro da conversa**
- [ ] **Info da conversa (drawer)**
- [ ] **Selecionar múltiplas + ações em lote**
- [x] Realtime multi-aba
- [x] Scroll (ResizeObserver)
- [ ] Upload preview antes de enviar (auditar)
- [ ] Cold-load < 3s

---

## 14. Mobile — checklist

Auditar em iPhone SE (375×667), iPhone 14 (390×844), Android médio (412×892):
- Sidebar → bottom nav ✅
- Inbox (lista + conversa) ✅
- CRM (lista + perfil) ✅
- Composer com teclado aberto (não cobrir input) — **validar**
- Sheets: nunca ocupar >90% da altura sem scroll
- FABs: nunca sobrepor CTA principal
- Toques mínimos 44×44

---

## 15. Desktop — checklist

- Layout 1440 × 900 default
- Sidebar colapsível
- Todos modais < 640px de largura ou fullscreen
- Atalhos de teclado: `⌘K` command palette (já existe), `⌘/` foco composer, `Esc` fecha modal
- Mouse-over states em todos elementos interativos

---

## 16. Testes — checklist v1.0

**Mínimo obrigatório para RC:**
- Vitest unitário: **cobertura ≥ 60%** nas server functions críticas (`inbox.functions`, `flows.functions`, `crm.functions`, `runtime/*`, `guardian.functions`)
- Playwright E2E: **10 fluxos críticos** persistentes em `tests/e2e/`
  1. Login + criar empresa
  2. Aceitar convite
  3. Conectar canal WhatsApp Cloud
  4. Enviar/receber mensagem
  5. Criar contato + kanban
  6. Publicar fluxo + disparar pelo Inbox
  7. Fluxo com WAIT resume
  8. Nó IA em fluxo
  9. Guardian abre incident + alerter dispara webhook
  10. Deletar mensagem (soft + hard)
- Testes de RLS por tabela crítica
- Teste de contrato dos endpoints `/api/public/*` (assinatura webhook)
- Gate de release: `scripts/rc1-gate.ts` estendido para exigir os 10 fluxos verdes

---

## 17. Qualidade — nota por módulo

| Módulo | Nota atual | Alvo v1.0 |
|---|:-:|:-:|
| Auth | 9 | 9 |
| RBAC | 9 | 9 |
| CRM | 8 | 9 |
| Inbox | 7 | 8,5 |
| WhatsApp Cloud | 8 | 9 |
| Fluxos (Studio) | 8 | 8,5 |
| Runtime | 9 | 9,5 |
| IA / Agentes | 7,5 | 8,5 |
| Guardian | 9 | 9 |
| Dashboard | 6,5 | 8 |
| Reports | 6 | 7 (parcial aceitável) |
| Campanhas | 7 | 7 |
| Cascatas | 7 | 7 |
| Segurança | 8 | 9 |
| Design System | 6,5 | 8,5 |
| Performance | 5,5 | 8 |
| Mobile | 7 | 8 |
| Documentação | 8 | 8,5 |
| **Média ponderada** | **7,4** | **8,5** |

Meta v1.0: **média ≥ 8,5** e nenhum módulo abaixo de 7,5.

---

## 18. Roadmap final (único e definitivo)

**Revisão 2026-07-17 (CTO WebMarcas):** o roadmap foi reordenado. A RC não começa mais por "Limpeza estrutural". Antes de qualquer refactor, remoção ou otimização, o sistema precisa provar que **substitui a operação real da WebMarcas de ponta a ponta**. Isso vira a Missão RC-00 abaixo. Regra derivada:

> **Nenhuma missão da v1.0 pode ser iniciada sem responder "sim" à pergunta: essa missão aproxima a WebMarcas de abandonar alguma ferramenta externa (planilha, WhatsApp paralelo, doc manual, sistema legado)?** Se a resposta for não, a missão vai para Pós-lançamento.

Ordem oficial: **RC-00 → RC-01 (Correções) → RC-02 (Performance/UX) → Release Candidate final → Release 1.0**. "Limpeza estrutural" deixa de ser missão isolada — vira consequência natural da RC-00 (só se remove o que a operação real provou que não precisa).

### 🔒 RC-00 — WebMarcas Operation Lock (pré-requisito absoluto)

Objetivo: transformar Zenda no **sistema operacional único da WebMarcas**. Critério de aceite: "se amanhã desligarmos todas as ferramentas externas, a WebMarcas continua operando 100% dentro do sistema".

Entregáveis obrigatórios:

1. **Mapa de operação real da WebMarcas** (`docs/webmarcas/OPERATION_MAP.md`) — inventário por área (Comercial, Jurídico/INPI, Financeiro, Cliente, Administração, Diretoria) listando **toda tarefa que a empresa executa hoje**, com a coluna "onde é feito hoje" (Zenda / planilha / WhatsApp paralelo / outro sistema / manual).
2. **Checklist de aceite operacional** (`docs/webmarcas/OPERATION_CHECKLIST.md`) — para cada tarefa: `✅ coberto` / `🟡 parcial` / `🔴 externo`. Só assinamos RC quando **zero itens 🔴 permanecem** ou cada 🔴 restante tem decisão explícita e assinada de "fica fora da v1.0".
3. **Gap-list executável** — cada `🔴` e `🟡` vira sub-missão numerada RC-00.x com escopo cirúrgico (config, preset, custom field, quick reply, tela mínima). Nada de módulo novo — apenas o mínimo para eliminar a ferramenta externa.
4. **Validação em produção com a equipe real** — comercial, jurídico, financeiro, atendimento e diretoria executam **um dia útil inteiro** só dentro do sistema. Sem WhatsApp paralelo, sem planilha, sem doc externo. Relatório assinado pelos operadores em `docs/webmarcas/OPERATION_LOCK_REPORT.md`.

Escopo mínimo esperado da checklist (a ser refinado no mapeamento):

| Área | Tarefas que precisam estar dentro do sistema |
|---|---|
| Comercial | receber lead, ligar, WhatsApp, negociar, proposta, contrato, assinatura, pagamento, virar cliente |
| Jurídico / INPI | cadastrar processo, acompanhar INPI, emitir recurso, emitir laudo, publicar andamento, anexar documentos |
| Financeiro | cobrar, parcelar, receber, controlar inadimplência |
| Cliente | entrar, acompanhar processo, baixar documentos, abrir chamado |
| Administração | cadastrar funcionário, controlar permissões, acompanhar produtividade |
| Diretoria | faturamento, pipeline, tempo médio, conversão, volume de processos |

Duração estimada: **5–8 dias úteis** (mapeamento 1–2d, gaps cirúrgicos 3–5d, dia de validação 1d, relatório 1d).

**Gate de saída RC-00:** checklist assinada pela WebMarcas com zero 🔴 pendente sem decisão, `docs/webmarcas/OPERATION_LOCK_REPORT.md` aprovado.

Só depois disso a RC-01 é liberada.

### 🚦 Release Candidate — RC-01 (Correções) → RC-02 (Performance/UX)

Ordem sequencial recomendada. As antigas 10 missões continuam válidas, mas agora divididas em duas ondas — e "Limpeza estrutural" vem *depois* de RC-00 (só se remove o que a operação real dispensou):

**RC-01 — Correções críticas e estabilidade**

| # | Missão | Duração |
|:-:|---|:-:|
| 1 | **Runtime bugs High** — RT-H-01, RT-H-02, RT-H-03 (transacional + provider_message_id) | 2d |
| 2 | **Segurança** — nova scan + `exec_read_sql` whitelist + revogar EXECUTE amplos + RLS test suite | 2d |
| 3 | **Conectar canal WhatsApp Cloud real** da WebMarcas (substituir mocks) | 1d |
| 4 | **Limpeza estrutural pós-RC-00** — remover apenas rotas/módulos que a RC-00 provou não fazer parte da operação (§3), consolidar docs A5, higienizar incidents Guardian históricos | 2d |

**RC-02 — Performance e UX**

| # | Missão | Duração |
|:-:|---|:-:|
| 5 | **Performance Inbox** — `signMany`, auth cache, boot em `Promise.all`, bundle split; alvo <3s cold-load | 3d |
| 6 | **UX Inbox v1.0** — marcar não lida + arquivar + buscar na conversa + info da conversa + seleção múltipla | 3d |
| 7 | **Preset WebMarcas** — custom fields + pipeline + quick replies + agente IA INPI + 1 fluxo template (o que a RC-00 exigir) | 2d |
| 8 | **Design System audit** — consolidar botões/modais/toasts/loading/empty states; corrigir desvios | 2d |
| 9 | **Suite E2E Playwright** dos 10 fluxos críticos + gate `rc1-gate.ts` estendido | 3d |
| 10 | **UX walkthrough** desktop + mobile das 10 rotas críticas; corrigir só o que quebra fluxo | 2d |

**Sequencial:** RC-00 → RC-01 (1 → 2 → 3 → 4) → RC-02.
**Paralelo possível dentro de RC-02:** 5/6/7/8 podem rodar em paralelo se houver frentes independentes; 9/10 são finais.

Duração estimada linear (RC-00 + RC-01 + RC-02): **~27 dias úteis**. Com 2 frentes paralelas em RC-02: **~19 dias úteis**.

**Gate de saída RC:** RC-00 assinada + RC-01/RC-02 concluídas + `rc1-gate.ts` verde + scan de segurança zero Critical/High + Guardian score 100 por 7 dias corridos.

### 🚀 Release 1.0 — obrigatório

Só entra em 1.0 o que RC não pôde entregar sem risco:

| # | Missão | Duração |
|:-:|---|:-:|
| 11 | **Retenção pg_cron** TTL 30d em `guardian_*`, `flow_events`, `flow_run_steps`, `channel_events` | 1d |
| 12 | **Reorganizar `src/lib/`** em subdomínios (ARCH-H-01) | 3d |
| 13 | **Dashboard consolidado de saúde** (widget único em Settings/Guardian) | 1d |
| 14 | **Documentação de operação WebMarcas** — 1 manual real do operador (`docs/webmarcas/OPERATOR_MANUAL.md`) | 2d |
| 15 | **2 semanas de operação real WebMarcas** com Guardian score ≥ 95 e zero Critical | 10d corridos |
| 16 | **Release notes v1.0** + `docs/audits/release-1.0/CLOSURE_REPORT.md` | 1d |

**Gate de saída 1.0:** operação real ≥ 2 semanas, NPS interno WebMarcas ≥ 8/10, zero Critical, DLQ = 0, cold-load Inbox estável < 3s.

### 🌱 Pós-lançamento — opcional (v1.1+)

| Área | Item |
|---|---|
| Multi-canal | Provider Instagram / Facebook / Email |
| Monetização | Stripe/Asaas + enforcement `plan_limits` |
| Multi-tenant público | Reorganização final, staging, DR completo |
| Grupos B/C/D INBOX-UX-01 restantes | Silenciar, reagir, mais atalhos |
| Domain events com subscribers | Reativar se houver caso de uso |
| Marketplace / plugins | Reabrir `src/lib/plugins/` |
| Notificações UI push | Se WebMarcas pedir |
| Agenda completa | Se WebMarcas pedir |

Nada aqui bloqueia v1.0. Só entra em v1.1 com evidência de necessidade.

---

## 19. Filosofia executiva (regras do CTO para toda missão de RC)

1. **Operação real vem primeiro.** Nenhuma missão inicia sem responder "sim" a: *essa missão aproxima a WebMarcas de abandonar alguma ferramenta externa?* Se não, vai para Pós-lançamento.
2. **Cortar antes de adicionar.** Cada PR deve remover pelo menos 1 linha morta — mas só depois que a RC-00 provou o que é morto de verdade.
3. **Uma tela = um propósito.** Se um caso de uso tem 2 caminhos, sobra 1.
4. **Nenhum "experimental" em produção.** Widget experimental = removido ou promovido.
5. **Nenhum código sem teste E2E se estiver na jornada crítica.**
6. **Nenhuma feature nova durante RC.** Se surgir ideia, vai para Pós-lançamento sem discussão.
7. **Métricas primeiro, opinião depois.** Antes de otimizar, medir.
8. **WebMarcas é o cliente único.** Qualquer feature que não a beneficia diretamente, adia.
9. **Rollback plan em toda missão.** Migration reversível, feature flag opcional.

---

## 20. Estado do plano

- ❌ Não aprovado ainda.
- ❌ Nenhuma missão iniciada.
- ✅ Substitui todos os roadmaps anteriores após aprovação.
- ✅ Após aprovação, este documento é a única fonte de verdade até v1.0 lançada.
- ✅ Ordem oficial de execução: **RC-00 → RC-01 → RC-02 → RC final → Release 1.0**.

**Ao aprovar, o usuário deve responder:**
> "Aprovado RELEASE 1.0 MASTER PLAN. Iniciar Missão RC-00: WebMarcas Operation Lock."

A partir dali, execução segue estritamente a ordem definida na §18. Cada missão termina com relatório em `docs/audits/release-1.0/RC-<n>-<slug>.md` e decisão explícita Encerrada / Bloqueada.

A partir dali, execução segue estritamente a ordem definida na §18. Cada missão termina com relatório em `docs/audits/release-1.0/RC-<n>-<slug>.md` e decisão explícita Encerrada / Bloqueada.

---

**Fim do RELEASE 1.0 MASTER PLAN.**
