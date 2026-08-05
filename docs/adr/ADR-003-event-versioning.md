# ADR-003 — Event Versioning

## Status
Accepted — 2026-07-15

## Contexto
Eventos em `domain_events` cresceram sem versionamento. Consumidores futuros
(analytics, Guardião, replay) precisam saber qual schema esperar.

## Decisão
Todo evento passa por `emitEvent()` (`src/lib/events/registry.ts`) e é
persistido com envelope obrigatório:

```
{ type, schemaVersion, producerVersion, occurredAt, correlationId, actorId, companyId, payload }
```

- `schemaVersion` do evento vem do registry (`EVENT_REGISTRY`).
- `producerVersion` vem de `APP_PRODUCER_VERSION` (bump em breaking changes).
- Consumers declaram `consumerVersion` em seus subscribers para permitir fallback.
- Nunca quebrar um `schemaVersion` existente — sempre criar `vN+1`.

## Consequências
- Migration adiciona coluna `event_version` a `domain_events` (default 1, backfill).
- Escritas diretas em `domain_events` são proibidas fora de `emitEvent`.
- Replay/reprocessing pode filtrar por `(type, schemaVersion)`.
