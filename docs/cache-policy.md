# Cache Policy

Todas as `useQuery` derivam a chave de `qk.*` e o `staleTime`/`gcTime` de
`cachePolicy.*` (`src/lib/query/keys.ts`).

| Categoria     | staleTime | gcTime    | Uso                                     |
| ------------- | --------- | --------- | --------------------------------------- |
| `realtime`    | 0         | 30s       | Conversas, mensagens, presença          |
| `frequent`    | 15s       | 5 min     | Listagens principais, dashboards        |
| `stable`      | 60s       | 10 min    | Configurações, canais, templates        |
| `reference`   | 5 min     | 30 min    | Permissões, roles, feature flags        |

## Invalidação

Toda mutação chama `invalidateFor(qc, event, payload)` em `onSuccess`, onde
`event` é um tipo do `EVENT_REGISTRY`. O mapa em `src/lib/query/invalidators.ts`
cuida de invalidar todas as chaves afetadas de uma só vez, evitando
`invalidateQueries` manual em cada callsite.

## Optimistic Updates

Padrão via `useOptimisticMutation(options)` (a criar em `src/lib/query/optimistic.ts`)
que aplica `onMutate`/`onError`/`onSettled` com rollback automático.
