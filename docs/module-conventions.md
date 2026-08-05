# Convenções para novos módulos

Antes de considerar um módulo concluído, todos os itens abaixo devem ser
verdadeiros. Este é o gate obrigatório de code review.

## Backend

- [ ] Toda server function de mutação passa por `requirePermission(context, P...)`
      ou `requireAdmin(context)` do `src/lib/rbac/guard.ts`.
- [ ] Nenhuma chamada direta a `has_role` (apenas o guard central).
- [ ] Toda mutação registra:
  - `team_audit_log` (ação + entidade + diff)
  - `team_entity_history` (quando altera entidade versionada)
  - `domain_events` (evento de negócio, com `correlation_id`)
- [ ] Validação de input com Zod dentro de `inputValidator`.
- [ ] Envolve erros com `AuthorizationError` / `throwFriendly` conforme o caso.

## Frontend

- [ ] Elementos sensíveis envoltos em `<Can permission={P...}>`.
- [ ] Estados `LoadingState`, `EmptyState`, `ErrorState`, `PermissionDenied`
      todos presentes na tela.
- [ ] Mutations usam `useMutation` com `onSuccess`/`onError` disparando toasts.
- [ ] Realtime dentro de `useEffect` com cleanup (`supabase.removeChannel`).

## Testes

- [ ] Suíte E2E cobrindo o fluxo principal (`tests/e2e/<modulo>.spec.ts`).
- [ ] Baseline visual em 3 viewports para as rotas principais.
- [ ] Budget de performance no `perf-budget.json` (LCP/TBT/bundle).

## Docs

- [ ] Referência do módulo criada/atualizada em `docs/`.
- [ ] ADR criado se a decisão for estrutural.
- [ ] Entradas em `docs/domain-events.md` para todos os eventos emitidos.
