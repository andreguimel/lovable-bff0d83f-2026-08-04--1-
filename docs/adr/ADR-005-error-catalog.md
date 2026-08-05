# ADR-005 — Error Catalog

## Status
Accepted — 2026-07-15

## Contexto
Mensagens textuais soltas quebram i18n, suporte e observabilidade. Bugs
recorrentes recebiam mensagens ligeiramente diferentes a cada lançamento,
impedindo alertas confiáveis.

## Decisão
Todo erro lançado em código de aplicação é uma `AppError` com código
canônico do catálogo (`src/lib/errors/catalog.ts`). Cada código carrega:

```
{ code, category, message, httpStatus, retryable, severity, docsUrl? }
```

Convenção: `MODULE_NNN` (`CRM_014`, `FLOW_004`, `AI_021`, `RBAC_001`, ...).

- Server functions traduzem erros externos para códigos do catálogo via
  `toAppError()`.
- UI renderiza `error.spec.message` (i18n futuramente) e `error.correlationId`.
- Observabilidade indexa por `code` — alertas ficam estáveis.

## Consequências
- `throw new Error("texto solto")` proibido (a exigência é reforçada via revisão de código enquanto o lint boundary é adicionado).
- `docs/errors.md` é gerado a partir do catálogo.
- Novos módulos alocam próximo bloco de códigos.
