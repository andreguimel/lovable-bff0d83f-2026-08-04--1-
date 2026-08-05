# ADR-002 — Service Container e Arquitetura em Camadas

## Status
Accepted — 2026-07-15

## Contexto
O código de negócio estava misturado com acesso direto ao Supabase em
componentes, hooks e dialogs. Isso dificulta testes, geração de contratos,
observabilidade uniforme e evolução do banco.

## Decisão
Adotar quatro camadas obrigatórias:

```
UI  →  Hook  →  Application Service  →  Domain Service  →  Repository  →  Provider (Supabase)
```

- **UI:** apenas renderização, `useQuery`/`useMutation`.
- **Application Service:** orquestra comandos (transação, side-effects, evento).
- **Domain Service:** regras de negócio puras, testáveis sem I/O.
- **Repository:** SQL/Storage/RPC — o único autorizado a importar `@/integrations/supabase/*`.
- **Provider:** clientes Supabase (browser, publishable server, admin, auth).

Um Container de Injeção de Dependência (`src/lib/di/container.ts`) resolve
tokens tipados (Logger, Metrics, EventBus, FeatureRegistry). Módulos
consomem via `resolve(TOKENS.X)` para permitir fakes em testes.

## Consequências
- Refactor incremental: cada PR migra um módulo (`src/domain/<mod>/`).
- Lint boundary bloqueia imports diretos de `@/integrations/supabase/client` fora de repositories.
- Server functions viram cascas finas: `.inputValidator(schema).handler(runPipeline(...))`.
