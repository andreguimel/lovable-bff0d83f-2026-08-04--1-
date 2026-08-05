# Error Catalog

Gerado manualmente por enquanto — em breve via `scripts/gen-errors-doc.ts`
a partir de `src/lib/errors/catalog.ts`.

## Regras

- Nunca lançar `new Error("texto")`. Sempre `raise("CODE")` ou `throw new AppError("CODE")`.
- Códigos são estáveis (contrato público). Mensagens podem evoluir; adicionar
  entradas i18n depois.
- Novos módulos reservam blocos: `CRM_100-199`, `FLOW_100-199`, etc.

Consulte `src/lib/errors/catalog.ts` para a lista completa e metadados
(`category`, `httpStatus`, `retryable`, `severity`).
