# State Model

Fontes de estado autorizadas na plataforma:

| Fonte                       | Uso                                             |
| --------------------------- | ----------------------------------------------- |
| TanStack Query cache        | Todo dado remoto. Chave via `qk.*`.             |
| `useState` local            | UI efêmera (aberto/fechado, hover, input).       |
| Route search params         | Filtros, paginação, seleção compartilhável.      |
| Route context (`beforeLoad`)| Sessão, usuário, empresa.                        |
| Zustand (`src/hooks/*`)     | Estado de UI global (sidebar, tema, palette).    |
| localStorage                | Apenas via `useHydrated()` — nunca em SSR.       |

## Proibido

- Contextos redundantes com Query (ex.: `ContactsContext` que reimplementa cache).
- `useEffect` + `fetch` como fonte primária de dados.
- `window.__globalState` ou singletons fora do DI container.

## Auditoria periódica

`scripts/state-audit.ts` (futuro) lista todos os `createContext`, `create(...)` (Zustand) e
consumidores. Mapa vive em `docs/audits/state-map.md`.
