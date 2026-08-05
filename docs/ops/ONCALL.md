# ONCALL — Zenda (Piloto WebMarcas)

Escala de plantão e responsabilidades. Documento vivo — atualizar
sempre que a escala mudar.

## Modelo do piloto

Durante o piloto WebMarcas (1 tenant, uso monitorado), o modelo é
**plantão único com backup**. Não há necessidade de rotação 24×7 formal.

- **Primary:** responsável principal por ACK e diagnóstico.
- **Backup:** aciona se primary não ACK em 5 min OU se incidente exigir 2 pessoas.
- **Owner de segurança:** obrigatoriamente acionado em qualquer incidente marcado como potencial vazamento ou comprometimento de credencial.

Preencher em cada semana:

```
Semana XX/YYYY
- Primary: <nome> — <contato>
- Backup: <nome> — <contato>
- Owner segurança: <nome> — <contato>
```

## Canais

- **Alertas do Guardian:** webhook configurado em `GUARDIAN_ALERT_WEBHOOK_URL` (Slack/Discord/email).
- **Comunicação interna:** canal `#zenda-plantao`.
- **Comunicação com cliente do piloto:** canal dedicado (nunca no de plantão).
- **Escalada:** ligação direta ao owner de segurança.

## Turnos

Piloto = janela comercial estendida (Seg–Sex 08:00–20:00 BRT).
Fora dessa janela, incidentes ficam registrados; ACK no início do próximo turno,
salvo Critical (24×7 via alerta externo).

## Responsabilidades por papel

### Primary
- Monitora canal de alertas continuamente durante o turno.
- ACK em ≤ 15 min (Critical) / 1 h (High).
- Executa o `RUNBOOK.md` do cenário aplicável.
- Preenche pós-incidente em `docs/ops/incidents/`.

### Backup
- Assume o papel do Primary se este não responder no SLA.
- Revisa pós-incidentes preenchidos (segundo par de olhos).

### Owner de segurança
- Aciona `DISASTER_RECOVERY.md` DR-3 em suspeita de comprometimento.
- Autoriza rotação de secrets fora da cadência regular.
- Autoriza `disable_signup` / restrições emergenciais.

## Handoff

Ao fim de cada turno:
1. Revisar `guardian_incidents WHERE status IN ('open', 'analyzing')`.
2. Registrar em `#zenda-plantao` incidentes em aberto + estado atual.
3. Confirmar que o próximo Primary reconheceu o handoff.

## O que NÃO é responsabilidade do plantão

- Desenvolvimento de features novas (bloqueado pelo congelamento).
- Refactor de código (bloqueado pelo congelamento).
- Missões grandes de auditoria (fluxo de missões oficiais separado).

O plantão executa **apenas** RUNBOOK, INCIDENT_RESPONSE e DISASTER_RECOVERY.
Qualquer trabalho fora disso vira card no backlog.

## Métricas de saúde do plantão (rever quinzenal)

- Nº de alertas recebidos.
- Nº de alertas realmente acionáveis (excluindo duplicatas / rate-limited).
- Tempo médio de ACK.
- Tempo médio de resolução por severidade.
- Incidentes reincidentes (mesmo fingerprint em janela de 7 dias).

Se ruído de alertas > 30% do total, revisar `GUARDIAN_ALERT_MIN_SEVERITY`
e `GUARDIAN_ALERT_COOLDOWN_MS`.
