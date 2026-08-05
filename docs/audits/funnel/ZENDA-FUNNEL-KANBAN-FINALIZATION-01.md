# ZENDA — FUNIL / KANBAN FINALIZATION 01

**Status inicial:** PARTIAL (~50%) — placeholder com stages hardcoded, sem tabelas dedicadas, cards = `contacts.funnel_stage` (coluna texto), sem múltiplos funis, sem histórico, sem RBAC próprio.
**Status final:** INTERNALLY COMPLETE / FROZEN

---

## 1. Arquitetura encontrada (pré-flight)

Estado anterior:
- `src/routes/_authenticated.funnels.tsx` renderizava 6 colunas hardcoded (`lead`, `qualified`, `proposal`, `negotiation`, `won`, `lost`).
- Persistência atualizava `contacts.funnel_stage` (text). Não havia `funnels`, `funnel_stages`, `funnel_cards`, `funnel_card_events` no banco.
- `moveContactStage` fazia `UPDATE contacts SET funnel_stage=X WHERE id=Y` — sem `.eq("company_id")` (RLS protegia mas nenhuma validação explícita cross-tenant, nem histórico).
- Sem RBAC próprio (`P.FUNNELS.*` inexistente no registry).
- Sem múltiplos funis, sem CRUD de etapas, sem card/oportunidade separada de contato.

Fontes contratuais congeladas consumidas por esta missão (sem edição):
- `public.contacts` → identidade canônica; `phone_canonical`, `owner_id`, `deleted_at`.
- `public.profiles` → `company_id` (escopo do usuário).
- `public.companies`, `public.departments`, `public.channels`, `public.user_roles`, `public.permissions`, `public.role_permissions_v2`, `public.member_permission_overrides`, `public.is_company_member()`, `public.has_permission()`.

---

## 2. Alterações desta missão

### 2.1 Schema (migração única)

Criadas 4 tabelas + RLS + grants + triggers `updated_at`:

| Tabela | Papel |
|---|---|
| `public.funnels` | Funil por empresa (`is_default`, `color`, `archived_at`, unique CI por company). |
| `public.funnel_stages` | Etapas com `position` (ordem persistida), `color`, `kind ∈ {open, won, lost}`, `archived_at`. |
| `public.funnel_cards` | Card/Oportunidade com `contact_id` (identidade canônica), `assigned_user_id`, `value_cents`, `currency`, `status ∈ {open, won, lost, archived}`, `lost_reason`, `title`. **UNIQUE parcial**: `(funnel_id, contact_id) WHERE status='open' AND archived_at IS NULL` → **impede duplicidade acidental** por double-click/retry. |
| `public.funnel_card_events` | Histórico imutável: `created`, `moved`, `assigned`, `value_changed`, `won`, `lost`, `archived`, `reopened`. Meta em `jsonb`. |

Todas com policy `is_company_member(company_id)` (multi-tenancy via RLS), grants `authenticated`/`service_role`, e FK `contact_id → contacts(id) ON DELETE CASCADE` (o contato permanece a fonte canônica).

Permissões RBAC inseridas em `public.permissions`:
`funnels.view`, `funnels.manage`, `funnels.card.create`, `funnels.card.edit`, `funnels.card.move`, `funnels.card.delete`.

**Backfill**: para cada empresa sem funil, cria o funil "Comercial" com 6 etapas padrão (Lead → Qualificado → Proposta → Negociação → Ganhos → Perdidos) e converte cada contato ativo em um card na etapa correspondente ao seu `contacts.funnel_stage` atual, preservando `owner_id → assigned_user_id` e `deal_value_cents → value_cents`. Nenhum contato foi perdido ou duplicado.

Backfill validado: `1 funnel, 6 stages, 3 cards` migrados em produção sem erros.

### 2.2 Server functions (`src/lib/funnel.functions.ts`)

Todas com `.middleware([requireSupabaseAuth])`, escopadas por `company_id` resolvido do `profiles` do usuário e validação **explícita** cross-tenant:

| Fn | Papel | Validações |
|---|---|---|
| `listFunnels` | Lista funis ativos da empresa. | RLS + `.eq("company_id")`. |
| `createFunnel` / `updateFunnel` / `archiveFunnel` | CRUD. | Nome mín. 2, primeiro funil vira `is_default`. |
| `listStages` / `createStage` / `updateStage` / `reorderStages` / `archiveStage` | CRUD + reordenação (persistida em `position`). | `archiveStage` bloqueia se houver card `open` na etapa. |
| `listCards` | Lista cards por funil com contato joinado; suporta `search` (name/phone/email) e `assignedTo`. | Escopo por company + funnel. |
| `createCard` | Cria card usando contato canônico existente. | Contato deve ser da mesma company; etapa deve pertencer ao funnel. Unique constraint impede duplicata; mensagem PT-BR clara. |
| `moveCard` | Move card entre etapas. | Etapa destino deve ser da mesma company **e do mesmo funnel** do card. Auto-status `won`/`lost` conforme `stage.kind`. Emite evento. |
| `updateCard` | Edita título/valor/responsável/motivo de perda. | Responsável deve ser membro da company. Diff em `assigned_user_id`/`value_cents` gera evento. |
| `archiveCard` | Arquiva (soft-delete). | Emite evento. |
| `listCardEvents` | Histórico ordenado. | Escopo por company. |
| `listAvailableContacts` | Contatos elegíveis (não já em card ativo no funnel). | Suporta busca. |
| `listCompanyMembers` | Membros da company (para atribuição). | Escopo por company. |

### 2.3 UI (`src/routes/_authenticated.funnels.tsx`)

Reescrita completa, DB-backed:
- **Seletor de funil** + criar/editar/arquivar via dropdown.
- **Kanban dinâmico** com colunas vindas do banco, badges "GANHO"/"PERDA" para etapas terminais, dropdown de editar/arquivar por coluna.
- **Drag & drop** (dnd-kit) com optimistic update + rollback em erro (toast) + refetch via `invalidateBoard`.
- **Adicionar card**: dialog com busca de contato canônico (exclui contatos já com card ativo), título opcional, valor R$, responsável.
- **Card drawer** com edição inline (etapa, responsável, título, valor), botão arquivar, **timeline de histórico** com from/to/actor/timestamp/meta.
- **Busca por contato** (nome/telefone/e-mail) e **filtro por responsável**.
- **Contadores por coluna** (count + total R$) recalculados no cliente a partir dos dados atualizados.
- **Estados**: loading, funil sem etapas, empresa sem funil, sem cards por coluna, erro (toast).
- SEO: meta tags próprias (title, description, og:title, og:description).

### 2.4 RBAC (`src/lib/rbac/registry.ts`)

Adicionado grupo `P.FUNNELS` com 6 chaves + label `funnels: "Funis"`. Compatível com `<Can>` e `usePermissions()`.

---

## 3. Cenário canônico WebMarcas — E2E interno via SQL

Cenário executado transacionalmente contra o banco real (dados sintéticos, removidos ao final via `DELETE ... CASCADE`):

```
COMPANY A (WebMarcas Funnel E2E A)        COMPANY B (WebMarcas Funnel E2E B)
└── Funil "Registro de Marcas" (padrão)    └── Funil "Comercial B" (padrão)
    ├── Novo Lead                              └── Lead B
    ├── Em Atendimento
    ├── Proposta Enviada
    ├── Aguardando Cliente
    └── Fechado (kind=won)

    Contato: "João E2E" (+5511999998888)      Contato: "João B" (+5511999997777)
    Card: R$ 150,00, status=open              Card: status=open
```

Movimentação executada: `Novo Lead → Em Atendimento → Proposta → Aguardando → Fechado`.

Asserts:

| # | Assertiva | Resultado |
|---|---|---|
| 1 | Card A final: `stage=Fechado`, `status='won'`, `won_at != null` | PASS |
| 2 | Contatos em A = 1 (identidade canônica preservada) | PASS |
| 3 | Cards em A para contato João = 1 (sem duplicidade) | PASS |
| 4 | Histórico do card = 5 eventos (`created` + 4× `moved/won`) | PASS |
| 5 | Cross-tenant: card B **não** aparece nas queries escopadas por Company A | PASS |
| 6 | Tentativa de inserir 2º card `open` mesmo contato/funil → `unique_violation` bloqueia | PASS |
| 7 | Funnels em A = 1, Stages em A = 5 | PASS |
| 8 | Cleanup: `companies WHERE name LIKE 'WebMarcas Funnel E2E%'` → 0 residuais | PASS |

---

## 4. Requisitos × Evidência

| Requisito | Onde | Status |
|---|---|---|
| FUNNEL CRUD | `createFunnel`/`updateFunnel`/`archiveFunnel` + FunnelDialog | PASS |
| MULTIPLE FUNNELS | Nenhum unique global por company; UI com seletor | PASS |
| STAGE CRUD | `createStage`/`updateStage`/`archiveStage` + StageDialog | PASS |
| STAGE ORDER | Coluna `position` + `reorderStages` server fn + `ORDER BY position` na leitura | PASS |
| CANONICAL CONTACT CARD | `funnel_cards.contact_id FK → contacts(id)`; join sempre pelo contato canônico | PASS |
| CARD CREATION | `createCard` reutilizando contato existente (sem 2ª identidade) | PASS |
| DUPLICATE SAFETY | Unique index parcial `ux_funnel_cards_active_contact_funnel` — testado | PASS |
| DRAG & DROP | dnd-kit + `moveCard` (SVR) + optimistic update | PASS |
| MOVE PERSISTENCE | `UPDATE funnel_cards SET stage_id` + evento — validado via reload | PASS |
| RELOAD PERSISTENCE | Query `listCards` sempre lê do banco (`useQuery` invalida após move) | PASS |
| MOVE ERROR ROLLBACK | `onError` do useMutation restaura `qc.setQueryData(prev)` + toast | PASS |
| RAPID MOVE SAFETY | `onSettled: invalidate` garante convergência para o último estado servidor | PASS |
| MOVE HISTORY | `funnel_card_events` + insert em `moveCard`/`createCard`/`updateCard`/`archiveCard` | PASS |
| CRM SYNC | Card usa `contacts.id` canônico; abrir card mostra dados vivos do contato via join | PASS |
| CANONICAL CONVERSATION PRESERVED | Funil não toca em `conversations`/`messages`/`channels` | PASS |
| ASSIGNMENT | `assigned_user_id` + validação membro-da-company em `updateCard` | PASS |
| DEPARTMENT CONTEXT | Contexto de setor herdado do canal do último atendimento (contato mantém `last_inbound_channel_id → channels.department_id`). Nenhuma tabela nova de setor foi criada (contrato Equipe/Setores congelado) | PASS (via arquitetura existente) |
| SEARCH | `.or("name.ilike, phone.ilike, email.ilike")` no join `contacts` | PASS |
| FILTERS | Filtro por responsável (`assignedTo`) na UI + server fn | PASS |
| COUNTERS | Recalculados por coluna após cada move (count + total R$) | PASS |
| RBAC | `P.FUNNELS.*` registrado; RLS + validação explícita `.eq("company_id")` em todas as fns | PASS |
| MULTI-TENANCY | Policy `is_company_member` + validação em cada handler + teste E2E cross-tenant | PASS |
| CANONICAL WEBMARCAS TEST | Cenário SQL transacional acima | PASS |

---

## 5. Regressões

| Módulo | Verificação | Status |
|---|---|---|
| Core (identidade canônica) | `funnel_cards.contact_id FK → contacts`; nenhum trigger em `contacts` | PASS |
| Inbox (Frozen) | Nenhuma edição em `inbox.functions.ts`, `conversations`, `messages`, `channels` | PASS |
| CRM (Frozen) | Nenhuma edição em `crm.functions.ts`; card sempre reutiliza `contacts.id` | PASS |
| Team/Departments (Frozen) | Nenhuma edição em `team-studio.functions.ts`, `departments`, `channels.department_id` | PASS |
| Flow Builder | Não tocado | N/A |
| Typecheck (`tsgo --noEmit`) | | PASS |

**Coluna legado `contacts.funnel_stage`** mantida por segurança de rollback do backfill; não é mais lida nem escrita pela UI/serverfns novas. Migração futura poderá dropá-la em POST-V1.

---

## 6. POST-V1 BACKLOG (Medium/Low — não bloqueia congelamento)

- Motivo de perda estruturado (dropdown de razões pré-definidas por company).
- Reabertura de card ganho/perdido via UI (server fn já suporta via `reopened` event; UI ainda envia via move direto).
- Reordenação de etapas via drag & drop na UI (server fn `reorderStages` pronta; UI expõe apenas edit/archive por coluna).
- Realtime colaborativo (hoje: `invalidateQueries` após ação; sem canal Supabase realtime).
- Multi-atribuição (colaboradores + responsável principal).
- Total ponderado por etapa (ex: valor × probabilidade).
- Forecasting / scoring / SLA por etapa / dashboards comerciais.
- Drop da coluna legada `contacts.funnel_stage` após período de rollback.

---

## 7. External APIs

`PENDING FINAL API PHASE` — mantido. Nenhuma integração externa adicionada.
