# SaaS Commercial Ready — Roadmap Finito

**Marco alvo:** novos tenants (fora da WebMarcas) conseguem entrar, configurar, pagar e operar Zenda com isolamento adequado, onboarding guiado e cobrança automática.
**Ponto de partida:** WebMarcas Operation Ready certificado (fase anterior).
**Estimativa total adicional:** **28–32 dias úteis** (4 etapas + Final Gate).
**Regra herdada:** nada nesta fase reabre Flow Builder V1. Se surgir necessidade de novo bloco/kind, vira **Flow Builder V2** (fora deste escopo).

---

## ETAPA S1 — Onboarding + Self-Service Provider + Admin Master

**Objetivo:** transformar Zenda em produto self-service — o operador externo consegue criar empresa, convidar equipe, conectar canal WhatsApp Cloud próprio e publicar primeiro fluxo sem intervenção do suporte.

**Escopo (fechado):**

*Onboarding guiado (wizard end-to-end):*
- Passo 1: dados da empresa (aproveita `handle_new_user`).
- Passo 2: convite da equipe (aproveita `pending_invites`).
- Passo 3: escolha do domínio (Marcas & Patentes com presets vs Genérico).
- Passo 4: conectar canal WhatsApp Cloud.
- Passo 5: primeiro fluxo (template ou blank).
- Checklist `onboarding_progress` populada e visível no Dashboard.

*Self-service Provider WhatsApp Cloud:*
- UI em `/settings` ou `/channels/new` para o operador colar: App ID, App Secret, Verify Token (gerado ou custom), Phone Number ID, WABA ID.
- Validação síncrona (chama Meta Graph API para checar credenciais).
- Retorna webhook URL pronta para copiar na Meta Business.
- Botão "Testar handshake" que verifica GET verify.

*Admin Master:*
- Rota `/admin` restrita a super-role.
- Listar tenants: nome, criação, plano, canais, mensagens 30d, status.
- Ações: suspender, forçar plano, forçar downgrade, ver métricas.
- Baseado em `has_role` com nova role `super_admin` (adicionar ao enum `app_role`).

**Entregáveis:**
- Wizard onboarding 5 passos.
- Fluxo self-service de canal Cloud.
- Painel Admin Master.
- Migration adicionando role `super_admin` + policies restritivas.
- Relatório `docs/audits/finalization/S1-onboarding-selfservice-admin.md`.

**Critério de aceite:**
- Novo tenant consegue completar onboarding em < 15 minutos sem suporte.
- Admin Master consegue listar e suspender tenants.
- 0 High/Critical aberto após a etapa.

**Dependências:** WebMarcas Operation Ready certificado.
**Estimativa:** **7 dias úteis.**
**DONE quando:** relatório encerrado + suite verde + 1 tenant novo criado end-to-end com sucesso.

---

## ETAPA S2 — Billing + `plan_limits` Enforcement

**Objetivo:** cobrar tenants e enforçar limites de plano.

**Escopo (fechado):**
- Escolher provider único: **Stripe** (internacional) ou **Asaas** (Brasil). Recomendação: **Asaas** (mercado alvo brasileiro, PIX, boleto, cartão).
- Integração com `subscriptions` (já existe) para status/renewal.
- Preencher `plan_limits` com valores reais por plano: canais, mensagens/mês, agentes, fluxos, storage.
- Enforcement em runtime: bloquear criação além do limite, degradar com aviso amigável.
- Webhook do provider para atualizar `subscriptions.status`.
- Página `/settings/billing` com plano atual, uso, upgrade/downgrade, histórico de pagamentos.
- Trial gratuito de 14 dias configurável.

**Entregáveis:**
- Adapter `src/lib/billing/asaas.server.ts` (ou stripe).
- Webhook `/api/public/webhooks/billing/*` com verificação de assinatura.
- Middleware de enforcement nas server functions críticas (`createChannel`, `sendMessage` em massa, `createAgent`, `createFlow`).
- UI `/settings/billing`.
- Relatório `docs/audits/finalization/S2-billing-enforcement.md`.

**Critério de aceite:**
- Novo tenant assina plano pago (test mode).
- Ultrapassar limite bloqueia ação com mensagem clara.
- Webhook atualiza status corretamente.

**Dependências:** S1 verde.
**Estimativa:** **5 dias úteis.**
**DONE quando:** relatório encerrado + pagamento test PASS + enforcement PASS.

---

## ETAPA S3 — Segurança Comercial + Retenção + Staging + DR

**Objetivo:** endurecer a plataforma para operação multi-tenant pública.

**Escopo (fechado):**

*Segurança:*
- Substituir `exec_read_sql` por whitelist de queries nomeadas (ou revogar EXECUTE de `authenticated` e manter só para admin master).
- Revogar EXECUTE amplos das 12 funções DEFINER (SEC-H-02).
- Adicionar suíte automatizada de testes RLS: `messages`, `conversations`, `contacts`, `flow_runs`, `flow_versions`, `ai_agents`, `channels`.
- Rate-limit em `/api/public/*` (especialmente webhooks WhatsApp).
- Rodar `security--run_security_scan` — 0 Critical / 0 High aceitos.

*Retenção pg_cron TTL 30 dias:*
- `guardian_health_snapshots`, `guardian_runs`.
- `flow_events`, `flow_run_steps`.
- `channel_events`, `domain_events`.

*Staging + DR:*
- Ambiente staging separado (Lovable Cloud secundário ou branch de produção).
- Runbook backup/restore documentado.
- `docs/ops/DISASTER_RECOVERY.md` com RPO/RTO explícitos.
- Rotação semestral de secrets documentada.

**Entregáveis:**
- Migrations de retenção + revogações de EXECUTE.
- Suíte RLS automatizada.
- Middleware rate-limit em `/api/public/*`.
- Ambiente staging ativo.
- `DISASTER_RECOVERY.md`.
- Relatório `docs/audits/finalization/S3-security-retention-staging.md`.

**Critério de aceite:**
- Scan de segurança 0 Critical / 0 High.
- Suíte RLS verde: nenhuma leitura/escrita cross-tenant possível.
- Staging responde a smoke test.
- Runbook DR revisado.

**Dependências:** S2 verde.
**Estimativa:** **6 dias úteis.**
**DONE quando:** relatório encerrado + scan verde + suíte RLS verde + staging ativo.

---

## ETAPA S4 — Multi-canal + UX/Design Audit

**Objetivo:** ampliar cobertura de canais além de WhatsApp Cloud e polir a experiência para operadores externos que não conhecem a plataforma.

**Escopo (fechado):**

*Multi-canal (mínimo 1 provider adicional — recomendação: Instagram Direct via Meta Graph API, pois reusa Meta Business):*
- Adapter `src/lib/wa-providers/instagram.server.ts` (mesmo padrão do Cloud).
- Webhook `/api/public/webhooks/instagram/$channelId.ts`.
- UI de conexão no self-service (S1).
- E-mail provider (SendGrid/Postmark) como opção mais leve — 1 adapter unificado para envios transacionais e outbound simples.

*UX walkthrough:*
- 10 rotas críticas revisadas para operador externo (não WebMarcas): Inbox, CRM, Flows, Agents, Dashboard, Channels, Team, Settings/*, Auth, Invite.
- Documento `docs/audits/finalization/UX_WALKTHROUGH_SAAS.md` com 1 seção por rota (o que melhora / o que atrapalha / o que remove).

*Design System audit:*
- Consolidar botões (4 variants Shadcn), modais/drawers/sheets (1 componente por finalidade), toasts (`sonner` exclusivo), loading (3 padrões), empty/error states (1 componente cada).
- Corrigir desvios encontrados.
- `docs/design/design-audit-v1.md`.

**Entregáveis:**
- 1 provider adicional (Instagram ou Email) funcional.
- UX walkthrough documentado + correções aplicadas ao que quebra fluxo.
- Design audit + correções aplicadas.
- Relatório `docs/audits/finalization/S4-multicanal-ux-design.md`.

**Critério de aceite:**
- Novo canal envia/recebe end-to-end.
- 0 High/Critical após correções UX/Design.
- Operador externo consegue navegar sem manual.

**Dependências:** S3 verde.
**Estimativa:** **9 dias úteis.**
**DONE quando:** relatório encerrado + 2º provider ativo + UX/Design mergeados.

---

## FINAL GATE — SAAS COMMERCIAL READY

**Critérios objetivos:**
- ✅ WebMarcas Operation Ready mantido.
- ✅ Onboarding self-service completo em < 15 min sem suporte.
- ✅ Provider self-service (WhatsApp Cloud) funcional.
- ✅ Admin Master funcional.
- ✅ Billing ativo em modo test com pelo menos 1 provider (Stripe/Asaas).
- ✅ `plan_limits` enforcement em runtime.
- ✅ 0 Critical / 0 High.
- ✅ Suíte RLS verde.
- ✅ Retenção pg_cron ativa (30d).
- ✅ Staging ativo + DR documentado.
- ✅ ≥ 2 providers de canal disponíveis.
- ✅ UX + Design System auditados e corrigidos.

**Ao passar:** status oficial vira **SAAS COMMERCIAL READY**. Documento `docs/finalization/SAAS-COMMERCIAL-READY-CERTIFICATION.md` é emitido.

---

## Resumo em uma tela

| Etapa | Nome | Dias | Bloqueia SaaS |
|---|---|:-:|:-:|
| S1 | Onboarding + Self-Service Provider + Admin Master | 7 | SIM |
| S2 | Billing + `plan_limits` Enforcement | 5 | SIM |
| S3 | Segurança Comercial + Retenção + Staging + DR | 6 | SIM |
| S4 | Multi-canal + UX/Design Audit | 9 | SIM |
| — | **FINAL GATE — SAAS COMMERCIAL READY** | — | — |

**Total: 4 etapas + Final Gate · 27–32 dias úteis linear · ~22 dias úteis com paralelismo (S3 e S4 podem sobrepor parcialmente).**

---

## Fora deste roadmap (Pós-V1 definitivo)

- Facebook Messenger provider (Instagram cobre a intenção principal do Meta stack).
- SMS provider.
- Marketplace / plugins.
- Notificações UI push persistente.
- Agenda completa (`team_schedules`).
- Domain events com subscribers ativos.
- Flow Builder V2 (novos kinds, novas capabilities).
- Copiloto IA do Builder.
- Analytics avançado / CTR por bloco.
- Uploader in-node de mídia.
