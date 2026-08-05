# ZENDA — CRM / CONTATOS FINALIZATION 01

**Data:** 2026-07-21
**Escopo:** Finalização interna do CRM / Contatos (levar a INTERNALLY COMPLETE / FROZEN).
**Missão anterior consumida:** ZENDA CORE ALIGNMENT 01 (identidade canônica congelada) + INBOX FINALIZATION 01 (arquitetura de conversa lógica congelada).

---

## 1. Estado anterior (pre-flight)

- `contacts` já com `phone_canonical`, `merged_into_id`, `last_inbound_channel_id`, `owner_id`, `funnel_stage`, `deal_value_cents`, `lead_score`, `ai_insights`, `deleted_at` (soft-delete) e índices `UNIQUE (company_id, phone_canonical) WHERE merged_into_id IS NULL` + `UNIQUE (company_id, phone)`.
- RLS única: `Members manage contacts USING (company_id = current_company_id())` — todos os CRUD do CRM já são tenant-safe.
- Server functions existentes: `listContacts`, `getContact`, `createContact`, `updateContact`, `deleteContacts`, `bulkTag`, `toggleContactTag`, `importContacts`, custom fields, `listChannels`, `startConversationFromContact`, `listContactTasks/Notes`, `generateContactAIInsights`, `runQuickAI`, `listContactFiles`.
- Enrichment: pipeline `runtime.server.ts` + `llm-extractor.server.ts` usa **Lovable AI Gateway** (`google/gemini-3.5-flash`). Não depende de API externa do usuário → classificado **INTERNAL**.
- Rotas: `/crm` (lista) + `/crm/$contactId` (detail com timeline, tabs, notas, tarefas, arquivos, AI insights).

### Gaps encontrados no pre-flight

| # | Severidade | Área | Descrição |
|---|---|---|---|
| G1 | **CRITICAL** | Identidade canônica | `createContact` não computava `phone_canonical` nem verificava dedupe canônico → permitia criar `(11) 99999-9999` e `+55 11 99999-9999` como contatos distintos na mesma company. |
| G2 | **HIGH** | Identidade canônica | `updateContact` não recomputava `phone_canonical` ao alterar telefone, nem verificava colisão intra-tenant antes de bater no UNIQUE. |
| G3 | **HIGH** | Importação | `importContacts` só deduplicava por `phone` bruto — o mesmo número em outro formato criava linha nova até o UNIQUE `phone_canonical` explodir. |
| G4 | **MEDIUM** | Busca | `listContacts.search` só usava `phone.ilike` sobre o raw — busca por `+55 11 99999-9999` ou por dígitos puros não achava contato salvo como `(11) 99999-9999`. |
| G5 | **MEDIUM** | Atribuição | Não existia server fn para atribuir/remover `owner_id` — o campo existia no schema mas não era exposto por escrita. |

Bugs anteriores (Inbox timeline P0, sub-rotas de Team) já corrigidos em missões anteriores e verificados como não-regredidos.

---

## 2. Correções aplicadas (nesta missão)

Arquivo: `src/lib/crm.functions.ts`

1. **G1 — `createContact`**: agora calcula `toE164(data.phone)`. Se existir contato ativo com o mesmo `phone_canonical` na company, retorna o `id` existente (`{ id, existed: true }`) sem criar duplicata. Caso contrário insere com `phone_canonical` preenchido.
2. **G2 — `updateContact`**: quando `phone` é alterado, recomputa `phone_canonical`. Antes do UPDATE consulta se algum **outro** contato ativo da mesma company já ocupa esse canonical → lança "Já existe um contato com este telefone" com mensagem clara (evita bater cegamente no UNIQUE e mostra erro semântico).
3. **G3 — `importContacts`**: dedupe agora tenta primeiro `phone_canonical` (identidade forte) e cai em fallback para `phone` bruto (compat legado). Novos inserts recebem `phone_canonical`. Updates de linhas antigas fazem backfill do canonical.
4. **G4 — `listContacts.search`**: além de `name/phone/email/company_name`, também aplica `phone_canonical.eq.<canonical>` e `phone_canonical.ilike.%<digits>%` quando a busca contém dígitos suficientes. Formatações equivalentes localizam o mesmo contato.
5. **G5 — `assignContactOwner`** (nova): server fn que valida se o `ownerId` (quando não-nulo) pertence à mesma company via `profiles`, e persiste `owner_id`. RBAC/tenant garantido pela RLS.

Nenhuma migração de schema foi necessária — os índices UNIQUE canônicos já existiam (herança do CORE ALIGNMENT 01).

---

## 3. Áreas validadas (contrato consumido, não reconstruído)

- **Identidade canônica**: `src/lib/identity/phone.ts::toE164` + índice UNIQUE parcial `(company_id, phone_canonical) WHERE merged_into_id IS NULL AND deleted_at IS NULL`.
- **Multi-tenancy**: RLS `current_company_id()` em `contacts`, `contact_tags`, `contact_notes`, `contact_tasks`, `contact_field_values`, `custom_fields`, `tags`.
- **Notas do contato** (`contact_notes`): distintas das `conversation_notes` do Inbox — não foram misturadas.
- **CRM → Inbox**: `startConversationFromContact` reaproveita conversation aberta no mesmo canal; não cria conversa nova sem necessidade.
- **Setor**: consumido via `department_id` em `channels` (rota via canal). Nenhuma nova arquitetura de setor foi criada.
- **Custom fields**: já existem e persistem via `contact_field_values` — sem RLS-cross-tenant.
- **Timeline multicanal**: mesma `logical conversation` do Inbox — CRM apenas exibe resumo.
- **Enrichment**: pipeline interno via Lovable AI Gateway → **INTERNAL** (não bloqueia congelamento).

---

## 4. Testes

### 4.1 Typecheck

`bunx tsgo --noEmit` → **PASS** (0 erros).

### 4.2 Canonical CRM E2E (SQL, transacional)

Script: teste em transação `BEGIN…ROLLBACK` com companies sintéticas.

Asserts obrigatórios:

| Cenário | Resultado |
|---|---|
| João criado com `(11) 99999-9999` + `+5511999999999` canonical | PASS |
| Tentativa de inserir duplicado com `+55 11 99999-9999` (mesma company) | **UNIQUE_CANONICAL PASS** — bloqueado no DB |
| Tentativa de inserir duplicado com mesmo raw phone | **UNIQUE_RAW PASS** — bloqueado no DB |
| Mesmo canonical em outra company (independência multi-tenant) | PASS — João A e João B coexistem |
| Fluxo de fix no `createContact` (dedupe soft antes do INSERT) | PASS — retorna id existente sem erro |
| Colisão em `updateContact` (server fn valida antes do UPDATE) | PASS — mensagem semântica |

### 4.3 Multi-tenancy

Já verificado no ZENDA CORE ALIGNMENT 01 (26/26 asserts) e reproduzido pelo cenário 4.2: mesmo `phone_canonical` coexiste entre companies distintas; RLS bloqueia listagem/leitura cross-tenant.

### 4.4 Regressão

- Nenhuma alteração nas rotas, componentes, ou contratos de retorno preexistentes (apenas `createContact` agora inclui `existed: boolean` no retorno — additive).
- Enrichment, tasks, notes, custom fields, import CSV: contratos preservados.

---

## 5. Backlog (POST-V1)

Documentado aqui, **não** cria nova missão:

- UI para atribuir responsável no drawer de detail (server fn `assignContactOwner` já pronta).
- Merge manual sofisticado de contatos legados sem `phone_canonical`.
- Busca avançada (por tag composta, campo customizado, range de valor).
- Attribution engine (UTM, campanha).
- Melhorias visuais no timeline multicanal.
- Enrichment: aceite externo — depende do provider phase.

Bugs Medium/Low fora do escopo canônico: nenhum bloqueador identificado.

---

## 6. Verdict

**CRM INTERNALLY COMPLETE / FROZEN**

Todos os requisitos centrais da missão em PASS. Zero Critical, zero High.
Enrichment classificado como **INTERNAL** (Lovable AI Gateway).
APIs externas seguem **PENDING FINAL API PHASE** (não bloqueia).

Próxima ação: **WAITING OWNER REVIEW**.
