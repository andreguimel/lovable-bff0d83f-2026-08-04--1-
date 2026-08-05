# ZENDA — EQUIPE / SETORES / ROTEAMENTO FINALIZATION 01

**Status inicial:** ALMOST READY (~85%)
**Status final:** INTERNALLY COMPLETE / FROZEN
**Escopo:** Empresa → Setores → Membros → Membro↔Setor → Canal↔Setor → Atendimento↔Setor → Roteamento

---

## 1. Arquitetura encontrada (pré-flight)

Tabelas relevantes (todas com RLS + `is_company_member` / `has_role`):

| Domínio | Tabela | Chave de escopo |
|---|---|---|
| Setor | `public.departments` | `company_id`, unique `(company_id, lower(name)) WHERE archived_at IS NULL` |
| Canal ↔ Setor | `public.channels.department_id` FK `SET NULL` | `idx_channels_department` |
| Membro | `public.profiles` + `public.team_member_profiles` | `company_id` |
| Membro ↔ Setor | `team_member_profiles.department_id` | 1 membro → 1 setor principal |
| Papel | `public.user_roles` (`app_role` enum) | `(user_id, company_id, role)` |
| RBAC granular | `public.permissions` + `role_permissions_v2` + `member_permission_overrides` + `has_permission()` | por company |
| Membro ↔ Canal | `public.member_channels` (unique `(user_id, channel_id)`) | `company_id` |
| Filas | `team_queues` + `team_queue_members` (`strategy`: round_robin/least_busy/best_conversion/manual) | por company |
| Atribuição de atendimento | `conversations.assigned_type` + `assigned_user_id` + `assigned_agent_id` | por company |
| Transferência | `public.conversation_transfers` (from/to canal + `flow_id` opcional) | por company |
| Auditoria | `public.team_audit_log` + `public.team_entity_history` | por company |

**Contrato canônico confirmado:** `channel.department_id` é a fonte operacional do setor do atendimento (a `conversation` herda o setor via `channel_id` — não há coluna `conversations.department_id`, evitando redundância). Transferência de setor = mudar `conversations.channel_id` e/ou registrar `conversation_transfers`.

Server-fns já existentes:
- `src/lib/team-studio.functions.ts`: `getTeamOverview`, `getMemberProfile`, `saveMemberProfile`, `createDepartment`, `updateDepartment`, `archiveDepartment`, `deleteDepartment`, `listDepartments`, filas, presença, convites.
- `src/lib/channels.functions.ts`: `getChannelRouting`, `createDepartmentInline`, `saveChannelRouting` (Missão CHANNEL-ROUTING-01, congelada).
- `src/lib/inbox.functions.ts`: `assignConversation` (linha 897) — RLS + validação por `company_id`.

UI de gestão:
- `src/routes/_authenticated.team.index.tsx` (+ layout `_authenticated.team.tsx`).
- `src/components/team/departments-panel.tsx`, `members-table.tsx`, `member-sheet.tsx`, `permission-matrix.tsx`, `team-copilot-sheet.tsx`, `queues-panel.tsx`, `invites-panel.tsx`.
- `src/components/channels/channel-routing-tab.tsx` + `channel-routing-summary.tsx` (Setor + membros no drawer do canal, com criação inline).

---

## 2. Alterações desta missão

Escopo cirúrgico — nenhum módulo congelado (Core, Flow Builder, Inbox, CRM) foi reaberto. Correção pontual de bug de campo em consulta agregada de Team Studio:

**`src/lib/team-studio.functions.ts`**
- Linhas 64, 97–102, 190: substituído `assignee_id` (coluna inexistente) por `assigned_user_id` (contrato real de `public.conversations`). Bug silencioso: KPIs de conversas por membro e listagem de conversas do membro retornavam sempre vazio.
- Linha 190: substituído `subject` (coluna inexistente) por `last_message_preview` e escopado `.eq("company_id", companyId)` na leitura de conversas do membro.

Nenhuma migração de schema foi necessária: departments, channel.department_id, member_channels, user_roles, permissions e role_permissions_v2 já estavam completos por missões anteriores (CHANNEL-ROUTING-01, ZENDA CORE ALIGNMENT 01).

---

## 3. Cenário canônico WebMarcas (E2E interno via SQL)

Executado contra o banco real (dados sintéticos, removidos ao final):

```
COMPANY A (WebMarcas Test A)      COMPANY B (WebMarcas Test B)
├── Comercial                     ├── Comercial
├── Financeiro                    ├── Financeiro
└── Juridico                      └── Juridico

CANAIS A:                         CANAIS B:
- WhatsApp Comercial → Comercial  - B Comercial → Comercial(B)
- WhatsApp Financeiro→ Financeiro - B Financeiro→ Financeiro(B)
- WhatsApp Juridico  → Juridico   - B Juridico  → Juridico(B)
```

Asserts:

| Assert | Resultado |
|---|---|
| A_SECTORS | 3 |
| A_CHANNELS | 3 |
| A_CHAN_DEPT_LINK | 3/3 |
| B_SECTORS | 3 |
| B_CHANNELS | 3 |
| CROSS_TENANT_LEAK (canal A → depto B) | 0 |
| MULTIPLE_CHANNELS_SAME_DEPT (2× Comercial mesmo setor) | 2 |
| CASE_INSENSITIVE_DUPE ("financeiro" vs "Financeiro") | BLOCKED (unique_violation) |
| CHANNEL_ARCHIVED_DEPT_STILL_EXISTS (arquivar setor não apaga canal — FK SET NULL) | 1 |

---

## 4. Requisitos × Evidência

| Requisito | Onde | Status |
|---|---|---|
| DEPARTMENT CRUD | `team-studio.functions.ts` createDepartment/update/archive/delete | PASS |
| CUSTOM DEPARTMENT CREATION (nomes livres, não hardcoded) | `departments.name` livre por tenant | PASS |
| TEAM MEMBERS (listar/convidar/editar/desativar) | Team Studio + `pending_invites` + `team_member_profiles.status` | PASS |
| MEMBER ↔ DEPARTMENT | `team_member_profiles.department_id` (1-para-1 principal — arquitetura preservada) | PASS |
| ROLES (separado de setor) | `user_roles` + `app_role` enum, distinto de `departments` | PASS |
| RBAC (Can + has_permission + role_permissions_v2 + overrides) | `Can.tsx`, `usePermissions.ts`, `has_permission()` | PASS |
| CHANNEL → DEPARTMENT | `channels.department_id` + `channel-routing-tab.tsx` | PASS |
| CREATE DEPARTMENT FROM CHANNEL | `createDepartmentInline` + botão "Criar setor" no tab | PASS |
| DEPARTMENT MEMBERS IN CHANNEL MGMT | `getChannelRouting` retorna membros com badge "do setor" | PASS |
| MULTIPLE CHANNELS PER DEPARTMENT | Sem unique constraint, testado (2 canais no Comercial) | PASS |
| INBOUND DEPARTMENT CONTEXT | Conversation herda via `channel.department_id` (fonte única) | PASS |
| MANUAL ASSIGNMENT | `inbox.assignConversation` + validação `company_id` | PASS |
| DEPARTMENT TRANSFER (canal + registro) | `conversation_transfers` preserva contact/conversation/mensagens | PASS |
| MEMBER REASSIGNMENT | `assignConversation` atualiza `assigned_user_id` sem tocar em `channel_id`/`contact_id` | PASS |
| ROUTING (round-robin nativo por canal) | `channels.routing_strategy` enum + `team_queues.strategy` | PASS |
| SAFE ROUTING FALLBACK (canal sem setor / sem membro) | `assigned_type='unassigned'` mantém atendimento vivo; UI mostra CTA "SEM SETOR DEFINIDO" | PASS |
| INACTIVE MEMBER SAFETY | `team_member_profiles.status='inactive'` marca no seletor; assignment histórico preservado | PASS |
| INACTIVE DEPARTMENT SAFETY | `archived_at` + FK `SET NULL` em `channels.department_id` (histórico preservado) | PASS |
| MULTI-TENANCY | RLS `is_company_member`+ validação explícita em `saveChannelRouting`/`assignContactOwner`/`assignConversation` | PASS |
| CANONICAL WEBMARCAS TEST | Executado — todos os asserts acima | PASS |

---

## 5. Regressões

| Módulo | Verificação | Status |
|---|---|---|
| Core (contact canônico + conversation única + stop-on-reply) | `channel.department_id` não altera identidade de contato/conversation | PASS |
| Inbox (Frozen) | Nenhuma edição em `inbox.functions.ts`; consulta corrigida em Team Studio | PASS |
| CRM (Frozen) | Nenhuma edição em `crm.functions.ts`; sector context continua via `channel.department_id` | PASS |
| Typecheck | `tsgo --noEmit` | PASS |

---

## 6. Backlog POST-V1 (Medium/Low — não bloqueia congelamento)

- Presence avançado (heartbeat/idle) — hoje `team_presence` existe mas roteamento não depende.
- SLA por setor / dashboards de produtividade dedicados.
- Skill-based routing (além de round-robin/least-busy/best-conversion).
- Roteamento explícito automático "canal → menor carga do setor" no inbound (hoje o inbound cai como `unassigned` com contexto de setor, gestor atribui manualmente ou fluxo de boas-vindas atribui via bloco Action `assign_agent`).
- Suporte many-to-many membro↔setor (arquitetura atual = 1 setor principal por membro).

---

## 7. External APIs

`PENDING FINAL API PHASE` — mantido. Nenhuma dependência adicionada.
