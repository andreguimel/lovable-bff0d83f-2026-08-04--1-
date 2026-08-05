# Architecture Decision Records

Cada decisão arquitetural importante é registrada como um ADR imutável.
Superseder um ADR antigo cria um novo (`ADR-NNN`) que marca o anterior como
`Superseded by ADR-NNN`; nunca reescrevemos o histórico.

## Template

```
# ADR-NNN — Título

- Status: Accepted | Proposed | Deprecated | Superseded by ADR-XXX
- Data: YYYY-MM-DD

## Contexto
## Problema
## Alternativas consideradas
## Decisão
## Consequências
## Motivo
```

## Índice

- [ADR-001 — RBAC baseado em Permission Registry](./ADR-001-rbac.md)
- [ADR-002 — Service Container e Arquitetura em Camadas](./ADR-002-service-container.md)
- [ADR-003 — Event Versioning](./ADR-003-event-versioning.md)
- [ADR-004 — Execution Pipeline](./ADR-004-execution-pipeline.md)
- [ADR-005 — Error Catalog](./ADR-005-error-catalog.md)
