# ADR-004 — Execution Pipeline

## Status
Accepted — 2026-07-15

## Contexto
Server functions duplicavam checagens de auth, permissão, feature flag, log,
audit e telemetria. Sem padronização, uma função podia esquecer o log de
audit ou emitir evento fora de ordem.

## Decisão
`runPipeline()` (`src/lib/pipeline/execute.ts`) executa a sequência canônica:

```
auth → permission → featureFlag → validation → idempotency
→ businessRules → repository → audit → events → realtime
→ notifications → telemetry → response
```

- Toda mutação passa por `runPipeline`.
- Erros lançam `AppError` (código do catálogo), automaticamente logados/metrificados.
- `idempotencyKey` bloqueia execuções duplicadas dentro de 60s.
- Latência e contadores exportados via `/api/public/metrics` (Prometheus).

## Consequências
- Server functions ficam declarativas: descrevem *o que*, não *como*.
- Migração incremental por módulo — funções antigas continuam funcionando até serem envolvidas.
- Métricas de `pipeline_duration_ms{operation,module,status}` disponíveis por default.
