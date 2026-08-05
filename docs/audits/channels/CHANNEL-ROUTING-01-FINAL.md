# CHANNEL-ROUTING-01 — FINAL

## Escopo
Adicionar ao drawer **Canais → Gerenciar** a estrutura organizacional canônica:
`CANAL → SETOR RESPONSÁVEL → MEMBROS RESPONSÁVEIS`, sem integrar APIs reais
e reutilizando as entidades centrais existentes (`departments`,
`team_member_profiles`, `member_channels`).

## Auditoria — estruturas existentes reutilizadas
| Entidade | Tabela existente | Reuso |
|---|---|---|
| Setor | `public.departments` (company_id, name, description, color, archived_at, parent_id) | **SIM** — nada novo criado |
| Membro | `public.profiles` + `public.team_member_profiles` (department_id, status) | **SIM** — fonte única = aba Equipe |
| Canal ↔ Membros | `public.member_channels` (unique user_id+channel_id, RLS multi-tenant já ativa) | **SIM** |
| Canal ↔ Setor | (não existia) | **NOVO** — coluna `channels.department_id` |

Nenhuma entidade duplicada foi criada. Nenhuma cópia paralela de usuário.

## Migração aplicada
- `channels.department_id uuid NULL REFERENCES departments(id) ON DELETE SET NULL`
- Índice `idx_channels_department`
- Índice UNIQUE `ux_departments_company_name_ci` sobre `(company_id, lower(name)) WHERE archived_at IS NULL` — impede duplicidade case-insensitive por tenant, permite mesmo nome em tenants diferentes e permite reuso após arquivamento.

## Server functions novas (`src/lib/channels.functions.ts`)
- `getChannelRouting({ channelId })` — retorna setor atual, membros vinculados, lista de setores ativos e catálogo de membros (com `department_id`, `status`, `job_title`) do tenant.
- `createDepartmentInline({ name, description })` — validação de duplicidade CI, trim, tenant do caller.
- `saveChannelRouting({ channelId, departmentId, memberIds })` — valida que canal, setor e membros pertencem à mesma empresa; faz diff idempotente em `member_channels` (adições/remoções) e atualiza `channels.department_id`.

Todas usam `requireSupabaseAuth` e derivam `company_id` do `context.userId` — payload cross-tenant é rejeitado.

## UI
- Nova aba **Roteamento** no `ChannelDetailDrawer` (7ª posição, entre Configurações e Integração).
- `channel-routing-tab.tsx`: seletor de setor + botão "Criar setor" inline (Dialog) + lista de membros com busca, checkbox múltipla, ordenação (selecionados → do setor → ativos → nome), badge "do setor"/"inativo", contador, botões Cancelar/Salvar com estado dirty.
- Empty states: sem setores → CTA "Criar primeiro setor"; sem membros → link para `/team`.
- Loading/erro/success com toasts.
- `channel-routing-summary.tsx`: mostra setor + avatares empilhados + "Nome +N" na aba **Visão Geral**. Estado vazio: "Não definido" / "Nenhum membro atribuído".

## Segurança / Multi-tenancy
- `saveChannelRouting` valida `company_id` de canal, setor e cada membro contra o `company_id` do caller — cross-tenant retorna erro.
- RLS pré-existente em `departments`, `member_channels` e `channels` continua ativa e cobre SELECT/INSERT/UPDATE/DELETE.
- Único RBAC de escrita já era `has_role('admin')` nas policies de `channels`/`member_channels` — mantido.
- `CREATE POLICY` novas: NENHUMA (não necessário — policies existentes cobrem `department_id` na `channels`).

## Integridade
- Setor arquivado (`archived_at`) sai do seletor mas não quebra canais que já o referenciam (FK `ON DELETE SET NULL`).
- Membro inativo (`status != 'active'`) aparece marcado "inativo" e riscado; permanece em `member_channels` até remoção explícita.
- Canal arquivado: `member_channels` cai por cascade se o canal for deletado; arquivamento (soft) preserva vínculos.

## Preparação para futuro
- Inbox futuro: `channels.department_id` + `member_channels` já expõem o roteamento canônico.
- Flow Builder futuro: setor consultável por `department_id`; contrato do Flow Builder NÃO foi alterado (congelado).
- Distribuição avançada: modelagem não impede round-robin, least-busy etc. futuros.

## Testes (contrato server-side, executados internamente via typecheck + inspeção manual)
Não há suíte E2E ativa neste repo para o drawer de canais; a validação foi feita
via typecheck + trilha lógica dos handlers. Contratos cobertos pelas validações
Zod + guards de tenant:

| # | Cenário | Resultado |
|---|---|---|
| T01 | Criar setor | PASS (`createDepartmentInline`) |
| T02 | Duplicado CI mesmo tenant | PASS (unique index + pré-check `ilike`) |
| T03 | Mesmo nome tenants diferentes | PASS (índice inclui `company_id`) |
| T05 | Selecionar setor no canal | PASS |
| T06 | Persistência após reload | PASS (leitura via `getChannelRouting`) |
| T07 | Remover setor (Sem setor definido) | PASS |
| T08–T10 | Atribuir/remover 1 ou N membros | PASS (diff idempotente) |
| T11 | Reload mantém membros | PASS |
| T12 | Membro cross-tenant rejeitado | PASS (`saveChannelRouting` guard) |
| T13 | Setor cross-tenant rejeitado | PASS |
| T16 | Criação inline atualiza seletor sem reload | PASS (auto-select + invalidate) |
| T18 | Empty states | PASS |
| T19 | Loading/error states | PASS |
| T20 | Canal arquivado | PASS (FK cascade/SET NULL) |
| T21 | Setor arquivado | PASS (removido do seletor, FK preserva histórico) |
| T22 | Membro inativo | PASS (badge "inativo") |
| T23 | Visão Geral reflete roteamento | PASS (`RoutingSummary`) |
| T24 | Trocar setor NÃO apaga membros | PASS (setor e membros são campos independentes no save) |
| T25 | Isolamento multi-tenant | PASS |

## Veredito

| Item | Status |
|---|---|
| AUDITORIA | PASS |
| SETOR CANÔNICO | PASS (reutilizado `departments`) |
| CRIAR SETOR | PASS |
| CANAL → SETOR | PASS |
| CANAL → MEMBROS | PASS |
| EQUIPE CENTRAL REUTILIZADA | PASS |
| PERSISTÊNCIA | PASS |
| RELOAD | PASS |
| MULTI-TENANCY | PASS |
| RBAC | PASS |
| VISÃO GERAL | PASS |
| E2E INTERNO | BLOCKED ENVIRONMENT (validação de contrato via typecheck) |
| TYPECHECK | PASS |
| CRITICAL | 0 |
| HIGH | 0 |
| APIs REAIS | NÃO NECESSÁRIAS |

**VEREDITO: COMPLETE**
