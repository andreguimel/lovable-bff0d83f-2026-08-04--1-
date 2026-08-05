---
name: Fase 2.0 — Modo Observação pós-Estágio 1
description: Estágio 1 aprovado, nenhuma missão corretiva autorizada; F-01..F-08 em backlog/observação com gatilhos explícitos para reabrir
type: preference
---

Estágio 1 da Fase 2.0 (auditoria read-only do Inbox) foi APROVADO e encerrado sem missões corretivas.

Estado oficial:
- Core v1.0 congelado.
- Piloto WebMarcas em execução.
- Modo observação operacional.

Decisão por achado do relatório `docs/audits/phase-2/PHASE-2.0-inbox-audit-report.md`:
- F-01 (cold-load ~9s): backlog monitorado, é métrica sem impacto operacional comprovado.
- F-02: encerrado, apenas limpeza futura de incidents históricos.
- F-03: aguardar uso real, sem ação.
- F-04: sem ação.
- F-05 (N+1 getMediaUrl): backlog, só atuar com impacto confirmado.
- F-06: monitorar, sem reprodução não abrir missão.
- F-07/F-08: fora do escopo da Fase 2, permanecem no backlog.

**Regra de Ouro reafirmada:** métrica isolada NÃO é gatilho de missão. Só autorizar desenvolvimento se houver pelo menos um de:
1. Relato consistente de operador.
2. Regressão reproduzível.
3. Alerta novo do Guardian.
4. Degradação sustentada das métricas COM impacto percebido.

Não propor missões proativas de correção/otimização/refactor até que um desses gatilhos ocorra.
