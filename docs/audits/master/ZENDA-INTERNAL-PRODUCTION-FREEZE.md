# ZENDA — INTERNAL PRODUCTION FREEZE

**Data:** 2026-07-21
**Selo:** `INTERNALLY PRODUCTION READY / FROZEN`
**External Provider Acceptance:** `PENDING FINAL API PHASE`

---

## Escopo do Freeze

Este documento sela o estado interno da plataforma Zenda após o
Master Final Internal Acceptance Gate. A partir desta data, nenhuma
missão de desenvolvimento funcional pode ser iniciada sem autorização
explícita do proprietário.

## Módulos Congelados

| Módulo | Status | Relatório |
|---|---|---|
| Core (Contatos canônicos + Conversation lógica + Stop-on-reply) | FROZEN | `docs/audits/master/ZENDA-CORE-ALIGNMENT-01-FINAL.md` |
| Flow Builder V1.1 | FROZEN | `docs/audits/flow-builder/FB-12-CRITICAL-FUNCTIONAL-FIX.md` |
| Inbox | FROZEN | `docs/audits/inbox/` |
| CRM / Contatos | FROZEN | `docs/audits/crm/ZENDA-CRM-FINALIZATION-01.md` |
| Team / Departamentos / Roteamento | FROZEN | `docs/audits/team/ZENDA-TEAM-DEPARTMENTS-ROUTING-FINALIZATION-01.md` |
| Funil / Kanban | FROZEN | `docs/audits/funnel/ZENDA-FUNNEL-KANBAN-FINALIZATION-01.md` |
| Guardião | FROZEN | `docs/audits/guardian/ZENDA-GUARDIAN-FINALIZATION-01.md` |
| Relatórios / Analytics | FROZEN | `docs/audits/analytics/ZENDA-REPORTS-ANALYTICS-FINALIZATION-01.md` |
| Dashboard | FROZEN | `docs/audits/dashboard/ZENDA-DASHBOARD-FINALIZATION-01.md` |
| Mensagens Rápidas | FROZEN | `docs/audits/quick-messages/ZENDA-QUICK-MESSAGES-FINALIZATION-01.md` |
| Ajustes | FROZEN | `docs/audits/settings/ZENDA-SETTINGS-FINALIZATION-01.md` |
| Canais | FROZEN | `docs/audits/channels/ZENDA-CHANNELS-FINALIZATION-01.md` |
| Campanhas | FROZEN | `docs/audits/campaigns/ZENDA-CAMPAIGNS-FINALIZATION-01.md` |
| Agentes IA | FROZEN | `docs/audits/ai-agents/ZENDA-AI-AGENTS-FINALIZATION-01.md` |

## Contratos Preservados

1. Empresa → vários canais WhatsApp → 1 contato canônico → 1 conversation lógica.
2. `messages.channel_id` rastreia todo tráfego multicanal.
3. `contacts.last_inbound_channel_id` atualizado **apenas** por inbound real.
4. Default reply channel = último canal inbound.
5. Manual override respeitado sem alterar `last_inbound`.
6. Cascade cross-channel A→B→C com stop-on-reply automático.
7. Idempotência de webhook por `provider_message_id`.
8. Idempotência de broadcast por claim atômico.
9. Isolamento multi-tenant absoluto (RLS + guards de aplicação).
10. Zero secret leak em client/logs/errors.

## Regras Pós-Freeze

- **Proibido:** novas features, refactor estético, redesign, novos subsistemas, reabrir Medium/Low.
- **Permitido:** apenas correção de Critical/High comprovado com evidência, documentado em nova missão específica.
- **Backlog Medium/Low:** consolidado em `docs/audits/master-audit/backlog.md` para POST-V1.

## Próximo Passo

Após aprovação do proprietário, iniciar `ZENDA — FINAL API PHASE`
seguindo inventário em `docs/finalization/ZENDA-FINAL-API-PHASE-INVENTORY.md`.
