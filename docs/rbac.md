# RBAC — Autorização

## Princípios

1. **Registry único** — todas as permissões vivem em `src/lib/rbac/registry.ts` como
   constantes tipadas (`P.MODULO.ACAO`). Nunca use strings soltas.
2. **Guard único** — server functions autorizam via `src/lib/rbac/guard.ts`
   (`requireAdmin`, `requirePermission`, `hasPermission`). Nenhum outro arquivo
   do código de aplicação deve chamar `has_role` diretamente.
3. **UI declarativa** — componentes envolvem elementos protegidos com
   `<Can permission={P.MODULO.ACAO}>` ou consultam `usePermission(key)`.
4. **Matriz por empresa** — grants ficam em `role_permissions_v2` por
   `(company_id, role, permission_key)` + overrides individuais em
   `member_permission_overrides`.

## Como adicionar uma permissão nova

1. Adicionar a chave em `src/lib/rbac/registry.ts` sob o módulo apropriado.
2. Seedar a linha em `public.permissions` via migration idempotente
   (`INSERT ... ON CONFLICT DO NOTHING`).
3. Consumir no backend com `requirePermission(context, P.MODULO.ACAO)` e no
   frontend com `<Can>` / `usePermission`.
4. Nunca criar rota/mutação nova sem uma permission key correspondente.

## `has_role` (legado)

Está preservado apenas para o bootstrap do papel `admin` dentro de
`src/lib/rbac/guard.ts`. Qualquer nova ocorrência fora desse arquivo é bug e
deve ser rejeitada no code review. Grep de validação:

```
rg "has_role\(" src --glob '!src/integrations/supabase/types.ts' --glob '!src/lib/rbac/guard.ts'
```

O comando acima deve retornar vazio.
