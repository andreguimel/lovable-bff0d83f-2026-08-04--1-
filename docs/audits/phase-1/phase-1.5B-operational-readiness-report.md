# Fase 1.5B — Operational Readiness

Missão autorizada em cima da recomendação da Fase 1 (Opção A + ajuste do
usuário). Escopo restrito a OBS-H-01 (alerting externo do Guardian) +
OPS-H-01 (documentação operacional). Sem refatoração, sem alteração de
Runtime, Banco (estrutura), Event Bus, Scheduler, Providers, Fluxos,
Inbox, CRM, IA ou Design System.

---

## OBS-H-01 — Guardian External Alerting

### O que foi entregue

Novo módulo isolado `src/lib/observability/guardian-alerter.server.ts`
que envia alertas para um webhook externo (Slack Incoming Webhook,
Discord, Teams ou endpoint próprio — payload é dual: `text` Slack-style +
objeto `guardian` estruturado). Chamado como **efeito colateral
best-effort** em dois únicos pontos, ambos apenas na criação de
**incidentes novos**:

1. `src/routes/api/public/guardian-cron.ts` — varredura automática do
   Guardian, após inserir uma nova linha em `guardian_incidents`.
2. `src/lib/guardian.functions.ts::reportGuardianIncident` — quando o
   reporter do frontend cria um incidente novo (fingerprint inédito).

Em ambos os pontos o alerter é chamado dentro de `try/catch` e nunca
propaga erro. Deduplicação de ocorrência já existente (`occurrences++`
+ `last_seen_at`) **não** dispara alerta — só o primeiro evento novo dispara.

### Configuração (100% por env vars, zero acoplamento)

| Variável | Default | Descrição |
|---|---|---|
| `GUARDIAN_ALERT_ENABLED` | `false` | Kill-switch. Só envia se `true` **e** URL definida. |
| `GUARDIAN_ALERT_WEBHOOK_URL` | — | URL do webhook externo. |
| `GUARDIAN_ALERT_MIN_SEVERITY` | `critical` | `info` / `low` / `medium` / `high` / `critical`. |
| `GUARDIAN_ALERT_COOLDOWN_MS` | `300000` (5 min) | Cooldown por fingerprint. |
| `GUARDIAN_ALERT_MAX_PER_MIN` | `12` | Rate limit global (janela deslizante 60 s). |
| `GUARDIAN_ALERT_TIMEOUT_MS` | `4000` | Timeout do POST. |
| `GUARDIAN_ALERT_ENV_LABEL` | `prod` | Label do ambiente no payload. |

Para ativar em produção, o operador roda `secrets--add_secret` para
`GUARDIAN_ALERT_WEBHOOK_URL` e `GUARDIAN_ALERT_ENABLED=true`. Fora disso,
o comportamento observável do sistema é idêntico ao anterior.

### Eventos cobertos

Todos os incidentes que o Guardian já classifica como `critical` (kind
`network`, `runtime`, `scheduler`, `dead_letter`, `flow_failure`,
`provider_failure`, `http_5xx`, `healthcheck`), pois o gatilho é a
inserção em `guardian_incidents` — não há lista paralela. Fingerprint
determinístico garante 1 alerta por causa raiz distinta.

### Deduplicação e rate limit

- **Fingerprint cooldown:** in-memory `Map` por fingerprint, janela
  padrão 5 min. Reincidência dentro da janela é registrada em
  `guardian_runs.action='alertSent'` com `result.reason='fingerprint_cooldown'`
  mas não envia.
- **Global cap:** janela deslizante de 60 s (default 12 alertas/min).
  Excedente é registrado com `reason='global_rate_limit'`.
- **Persistência de auditoria:** toda tentativa (sucesso, cooldown,
  rate-limit, erro HTTP) grava linha em `guardian_runs` via
  `supabaseAdmin`. Nenhuma tabela nova, nenhum schema alterado.

*Limitação conhecida:* o estado in-memory é por worker. Suficiente para
o piloto WebMarcas (tráfego único). Para multi-worker em fases futuras,
migrar para Cloudflare KV / Durable Object — registrado como sucessor
natural de `src/lib/security/rate-limit.ts`.

### Validação (evidências)

Testes automatizados em `src/lib/observability/__tests__/guardian-alerter.test.ts`
cobrem os quatro critérios da missão:

- ✅ Alerta enviado para incidente novo (`sent: true`, 1 chamada HTTP).
- ✅ Deduplicação por fingerprint dentro do cooldown (`skipped: 'fingerprint_cooldown'`).
- ✅ Rate limit global barra o 3º evento quando `MAX_PER_MIN=2`.
- ✅ Filtro por severidade mínima (`skipped: 'below_min_severity'`).
- ✅ Desabilitação por env (`GUARDIAN_ALERT_ENABLED=false` → `skipped: 'disabled'`,
  zero chamadas HTTP).
- ✅ Erro HTTP 500 do webhook é capturado, não propaga, `sent: false` +
  `error: 'HTTP 500'` registrado em `guardian_runs`.

### Regressão

- Healthcheck (`/api/public/health`, `/live`, `/ready`, `/metrics`): não
  tocados.
- Cron do Guardian: mesmo caminho, com uma única chamada `.catch(() =>
  undefined)` após insert bem-sucedido — não altera contadores,
  snapshots nem status de retorno da rota.
- `reportGuardianIncident`: mesmo retorno público (`{ incidentId, deduped }`);
  alerter dentro de `try/catch` isolado.

---

## OPS-H-01 — Documentação Operacional

Criados sob `docs/ops/`:

| Documento | Escopo |
|---|---|
| `RUNBOOK.md` | 8 cenários com identificar → diagnosticar → recuperar → validar → registrar (webhook Meta, cron, banco lento, incident Guardian, storage cheio, chave IA revogada, deploy quebrado, restore). |
| `INCIDENT_RESPONSE.md` | Severidades + SLAs, fluxo de resposta em 9 passos, regras de escalada, o que nunca fazer durante incidente. |
| `DISASTER_RECOVERY.md` | RPO/RTO do piloto, 4 cenários DR (corrupção lógica, deleção em massa, credencial comprometida, indisponibilidade > RTO), cadência de rotação de secrets. |
| `ONCALL.md` | Modelo primary/backup para o piloto, responsabilidades por papel, handoff, métricas de saúde do plantão. |

Cada cenário do RUNBOOK segue explicitamente a estrutura
**Identificar → Diagnosticar → Recuperar → Validar → Registrar**
exigida pela missão.

---

## Arquivos alterados

**Novos:**
- `src/lib/observability/guardian-alerter.server.ts`
- `src/lib/observability/__tests__/guardian-alerter.test.ts`
- `docs/ops/RUNBOOK.md`
- `docs/ops/INCIDENT_RESPONSE.md`
- `docs/ops/DISASTER_RECOVERY.md`
- `docs/ops/ONCALL.md`
- `docs/audits/phase-1/phase-1.5B-operational-readiness-report.md`

**Editados (edição mínima e localizada, dentro da regra do congelamento):**
- `src/routes/api/public/guardian-cron.ts` — captura `id` do insert e
  chama `sendGuardianAlert` best-effort. Nenhuma outra alteração.
- `src/lib/guardian.functions.ts::reportGuardianIncident` — chama
  `sendGuardianAlert` best-effort após insert. Nenhuma outra alteração.

**Não tocados:** Runtime, Banco (estrutura), Event Bus, Scheduler,
Providers, Fluxos, Inbox, CRM, IA, Design System, RBAC, RLS, migrations.

---

## Critérios de aceite (checklist)

- ✅ Guardian emite alertas corretamente (validado por teste + inspeção de call sites).
- ✅ Sem alertas duplicados (fingerprint cooldown + rate limit global testados).
- ✅ Documentação operacional completa (4 documentos).
- ✅ Nenhuma regressão no Core (nenhum arquivo de Runtime/DB/Providers alterado).
- ✅ Alerter fail-safe (nunca propaga erro, sempre registra em `guardian_runs`).

---

## Status

**Encerrada.** Backlog atualizado: `OBS-H-01` e `OPS-H-01` fechados.

## Próximo passo

Conforme decisão do usuário:

1. 🔒 Declarar **Core v1.0 congelado**.
2. 🚀 Iniciar **Piloto WebMarcas**.
3. 📊 Coletar métricas reais por 7–14 dias.
4. 🐞 Corrigir apenas bugs Critical/High durante o piloto.
5. 📅 Após estabilização, abrir Fase 2 (Omnichannel Inbox).

Para ativar o alerting externo no piloto, basta configurar:

```
secrets--add_secret GUARDIAN_ALERT_WEBHOOK_URL=<url>
secrets--add_secret GUARDIAN_ALERT_ENABLED=true
# opcional:
secrets--add_secret GUARDIAN_ALERT_MIN_SEVERITY=critical
```
