# ADR-001 — RBAC baseado em Permission Registry

- Status: Accepted
- Data: 2026-07-15

## Contexto

A plataforma passou a Onda 2 com dois modelos de autorização coexistindo:
`has_role('admin')` inline em cada server function, e uma matriz nova
`role_permissions_v2` + overrides consultada por `has_permission()`. O modelo
antigo é grosso demais (só distingue admin vs. resto) e o novo tem granularidade
suficiente para as personas do produto (admin, supervisor, operador, IA).

## Problema

Manter duas arquiteturas de autorização gera:

- risco de divergência (um caminho protege, outro não);
- impossível auditar quem pode o quê a partir do código;
- caro adicionar personas novas.

## Alternativas consideradas

1. Manter `has_role` e apenas adicionar granularidade a partir de novos roles
   (`agent`, `supervisor`, ...). Rejeitado: não permite overrides por usuário
   nem grants por empresa.
2. Usar Postgres RLS puro sem camada aplicativa. Rejeitado: RLS não cobre
   verificações necessárias em UI, mutations compostas e side-effects.
3. Registry aplicativo + tabelas normalizadas + guard único (escolhido).

## Decisão

- Todas as permission keys vivem em `src/lib/rbac/registry.ts` (`P.MODULO.ACAO`).
- Tabelas: `permissions`, `role_permissions_v2`, `member_permission_overrides`.
- Backend autoriza via `requireAdmin` / `requirePermission` em
  `src/lib/rbac/guard.ts` — único arquivo autorizado a chamar `has_role` como
  bootstrap.
- Frontend consome via `<Can>` e `usePermission`.
- Toda rota/mutação nova precisa de permission key correspondente.

## Consequências

- Positivas: contrato único, tipado, auditável; overrides por membro; grants
  por empresa; fácil onboarding de novo módulo.
- Negativas: requer migração dos usos antigos de `has_role` (feita na Onda 2);
  exige disciplina de code review para não introduzir strings soltas.

## Motivo

Base padrão em SaaS enterprise; a granularidade real é a de módulo × ação, não
a de papel monolítico.
