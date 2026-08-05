# INCIDENT RESPONSE — Zenda

Processo formal de resposta a incidentes. Aplica-se a qualquer alerta
recebido do Guardian (via webhook OBS-H-01) ou detectado manualmente.

## Severidade

| Severidade | Definição | SLA de resposta | SLA de resolução |
|---|---|---|---|
| **Critical** | Plataforma indisponível OU perda de dados em curso OU vulnerabilidade ativa | 15 min | 4 h |
| **High** | Fluxo canônico quebrado para tenant do piloto (Inbox, WhatsApp inbound/outbound, flows) | 1 h | 24 h |
| **Medium** | Feature secundária degradada; workaround existe | 1 dia útil | 5 dias úteis |
| **Low** | Cosmético / UX; sem impacto operacional | Backlog | Backlog |

## Fluxo obrigatório

1. **Reconhecer (ACK).** Quem receber o alerta responde no canal de plantão em ≤ SLA de resposta. Se ninguém ACK em 5 min, escalada automática (ver ONCALL.md).
2. **Classificar.** Confirmar severidade real (nem todo alerta é Critical).
3. **Diagnosticar.** Seguir o cenário aplicável no `RUNBOOK.md`. Coletar:
   - Timestamp de início.
   - Companies afetadas.
   - Fingerprint do incidente Guardian.
   - Logs relevantes (últimas 15 min).
4. **Mitigar.** Ação imediata para reduzir impacto (feature flag, pausar cron, revogar credencial comprometida).
5. **Recuperar.** Ação de fundo (correção real, restore, redeploy).
6. **Validar.** Reproduzir o cenário original — não confiar apenas em ausência de novos alertas.
7. **Fechar.** Marcar incidente como `resolved` em `guardian_incidents` com `fix_summary` preenchido.
8. **Pós-incidente.** Preencher entrada em `docs/ops/incidents/YYYY-MM-DD-<slug>.md` com:
   - Linha do tempo minuto a minuto.
   - Causa raiz.
   - Impacto (tenants, mensagens perdidas, tempo indisponível).
   - Ações de mitigação.
   - Ações preventivas (viram itens no backlog).
9. **Revisão.** Todo incidente Critical/High passa por revisão em ≤ 3 dias úteis.

## Escalada

- Não conseguiu diagnosticar em **30 min (Critical)** ou **2 h (High)** → escalar para o próximo nível (ONCALL.md).
- Suspeita de vazamento de dados → escalar **imediato** e congelar auth (`disable_signup: true` via `supabase--configure_auth`).

## Comunicação

- Interno: canal de plantão + log em `incidents/`.
- Cliente (WebMarcas): mensagem única quando (a) impacto direto e (b) status já mudou (evita "estamos investigando" repetido).

## O que NUNCA fazer durante incidente

- Rodar migration não planejada.
- Refatorar código no meio da mitigação.
- Trocar `FLOW_SCHEDULER_SECRET` / `LOVABLE_API_KEY` sem coordenação (quebra cron / IA em massa).
- Ignorar dedupe: se dois alertas parecem duplicados, verificar fingerprint antes de fechar.

## Templates de incident report

Ver `docs/ops/incidents/_template.md` (criar sob demanda no primeiro incidente).
