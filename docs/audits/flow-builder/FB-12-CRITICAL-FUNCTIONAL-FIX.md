# FB-12 · Correção crítica funcional/visual do Flow Builder

**Data:** 2026-07-20  
**Escopo:** estabilizar criação/conexão/inserção visual do Flow Builder sem reabrir roadmap grande.  
**Decisão:** **Encerrada**.

## Problema confirmado

O editor carregava, mas a experiência parecia rascunho porque a interação de conexão/inserção não transmitia confiabilidade:

- saídas podiam gerar duplicidade visual quando `sourceHandle` era tratado de forma inconsistente;
- inserir bloco sobre uma saída já ocupada não encaixava o novo bloco no caminho;
- handles do React Flow sofriam deslocamento por CSS e reduziam a área clicável real;
- feedback de saída conectada era global por nó, não por handle;
- cards e conexões estavam muito leves visualmente no zoom útil.

## Correções aplicadas

1. **Conexão por saída normalizada**
   - Uma saída (`source` + `sourceHandle`) mantém apenas uma conexão ativa.
   - Nova conexão manual substitui a anterior da mesma saída.

2. **Inserção inteligente no caminho**
   - Ao adicionar um bloco numa saída já conectada, o novo bloco entra entre o pai e o filho existente.
   - Blocos terminais encerram o caminho sem criar saída impossível.

3. **Handles estabilizados**
   - Removido conflito de posicionamento que interferia no hitbox do React Flow.
   - Feedback visual agora respeita cada saída individualmente.

4. **Polimento visual mínimo P0**
   - Cards mais sólidos, com barra de categoria, raio menor e borda mais definida.
   - Handles maiores e com área invisível ampliada.
   - Edges com peso visual maior para leitura de fluxo.

## Evidências

### Regressão automatizada

Comando executado:

```bash
bun test src/features/flow-builder/__tests__
```

Resultado observado: suíte do Flow Builder passou, incluindo testes de:

- `add-on-handle.test.ts`;
- `auto-layout-onload.test.ts`;
- `edge-labels.test.ts`;
- `blocks.test.ts`;
- persistência/round-trip dos blocos.

### Evidência visual/runtime

Rota validada no navegador local autenticado:

```text
/flows/35f608a7-7e4f-40a1-9734-6efc6043599e
```

Resultado observado antes do polimento final:

- canvas abriu sem erro de console;
- 10 nós renderizados;
- 12 edges detectadas;
- 0 ocorrências de “Bloco não reconhecido”;
- handles com `position: absolute`, preservando o comportamento nativo do React Flow.

## Limites mantidos

Não foram alterados:

- banco;
- RLS/RBAC;
- Runtime Engine;
- Providers;
- Event Bus;
- arquitetura global;
- Design System global.

## Status final

**Encerrada.** O Flow Builder já não está no estado “nada funciona”: os pontos críticos de conexão/inserção/feedback foram corrigidos e validados. O próximo aceite deve ser visual no editor real, não nova abertura de roadmap.