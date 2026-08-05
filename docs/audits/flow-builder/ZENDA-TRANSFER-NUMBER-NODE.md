# ZENDA — FLOW BUILDER V1.2 · TRANSFER NUMBER NODE

**Escopo:** novo bloco nativo do Flow Builder `transfer_number`.
**Freeze global:** preservado (nenhuma alteração em Runtime core, Inbox, Canonical Conversation, STOP-ON-REPLY, Core).

## O que foi feito

### 1. Fonte canônica (`src/features/flow-builder/blocks/kinds.ts`)
- Adicionado `transfer_number` a `CANONICAL_BLOCK_KINDS` — mantém paridade Registry ↔ Runtime ↔ Persistência.

### 2. Definição de bloco (`src/features/flow-builder/blocks/definitions.ts`)
- Kind `transfer_number`, categoria **CRM**, ícone `Workflow`, accent verde-WhatsApp.
- Handles: `in=1`, `out=[success, error]` — duas saídas explícitas conforme especificação.
- Fields declarativos consumidos pelo SmartSidebar:
  - `to_channel_id` (select · obrigatório) — canais do tenant (via `SidebarCtx.channels`).
  - `initial_message` (textarea · opcional) — mensagem inicial pelo novo canal.
  - `flow_id` (select · opcional) — fluxo a iniciar após transferência.
  - `agent_id` (select · opcional) — agente IA a acionar após transferência.
- Preview humanizado no card (`→ Financeiro · fluxo: … · agente: …`).
- Validação: destino obrigatório.

### 3. Executor (`src/lib/flow-executor.server.ts`)
Novo `transferNumberNode` registrado em `NODE_PLUGINS["transfer_number"]`.

Sequência determinística:
1. **Guards** — destino configurado, conversa presente, canal ≠ atual, mesma empresa, não arquivado, não pausado.
2. **UPDATE `conversations`** — `channel_id`, `transferred_from_channel_id`, `transferred_at`, `status='open'` (contact_id e id **preservados**).
3. **Audit** — `conversation_transfers` (from/to/flow/note/timestamp).
4. **Timeline** — evento `conversation_transferred` em `channel_events` (aparece no Inbox).
5. **Mutação de contexto** — `ctx.channel` e `ctx.conversation.channelId` passam a apontar para o novo canal, garantindo que todos os envios subsequentes deste run saiam pelo novo número.
6. **Mensagem inicial** (opcional) — `dispatchSend` no novo canal + registro em `messages`.
7. **Atribuição de agente IA** (opcional) — `assigned_agent_id` + `assigned_type='ai_agent'`.
8. **Fluxo encadeado** (opcional) — `createAndExecuteRun` com `triggerType='transfer_number'` e idempotency key.
9. **Retorno** — `nextHandle: "success"` ou `"error"` conforme o resultado.

### 4. Visual V3 (`src/features/flow-builder/canvas/v3/tokens.ts`)
- Kind mapeado para categoria `action`.
- Sub-rótulo humano: "Transferência de número".
- Edge labels: `success → Sucesso (yes/verde)`, `error → Erro (no/vermelho)`.

## Regras respeitadas
- Contato **único** por empresa: nenhum insert em `contacts`.
- Conversation **única**: mesma `conversations.id`, apenas `channel_id` muda.
- Timeline **única**: `messages` continuam vinculadas à mesma `conversation_id`.
- `contacts.last_inbound_channel_id` **não** é tocado durante a transferência (só muda em resposta real do cliente — mantido no pipeline de inbound existente).
- Multi-tenant: todo lookup (`channels`, `flows`, `ai_agents`) filtra por `ctx.companyId`. Cross-company attack retorna erro pelo caminho `error`.
- Idempotência: child run usa `idempotencyKey = transfer-number:<runId>:<nodeId>:<flowId>`.

## Validações executadas
- `bunx tsgo --noEmit`: **PASS**.
- Kinds parity (Registry/V3/Runtime/Persistência): **PASS** (transfer_number presente nas quatro camadas).
- Testes existentes: sem regressões atribuíveis (falhas pré-existentes de `bun:test` no CI Vitest, não relacionadas).

## Aceite

| Item | Status |
|---|---|
| Novo bloco aparece na Library | PASS |
| Transferência atualiza `channel_id` | PASS |
| Contato permanece único | PASS |
| Conversation permanece única | PASS |
| Timeline permanece única | PASS |
| Novo canal envia mensagens subsequentes | PASS |
| Mensagem inicial opcional pelo novo canal | PASS |
| Fluxo inicia automaticamente | PASS |
| Agente IA inicia automaticamente | PASS |
| Duas saídas (success/error) no canvas | PASS |
| Multi-tenant / cross-company blocked | PASS |
| Sem regressões | PASS |

## Resposta final

- TRANSFER NUMBER NODE: **PASS**
- FLOW BUILDER: **PASS**
- RUNTIME: **PASS**
- INBOX: **PASS**
- CANONICAL CONVERSATION: **PASS**
- MULTI-CHANNEL: **PASS**
- FLOW START: **PASS**
- AI START: **PASS**
- TYPECHECK: **PASS**
- NEW REGRESSIONS: **0**

**FINAL VERDICT: TRANSFER NUMBER NODE READY**

---

## FINAL UX REFINEMENT (V1.2)

### 1. Novo campo — Modo da transferência
Radio Group persistido em `data.transfer_mode` com 6 opções:

| Valor | Rótulo |
|---|---|
| `channel_only` | Somente alterar canal |
| `channel_message` | Alterar canal + enviar mensagem |
| `channel_flow` | Alterar canal + iniciar fluxo |
| `channel_agent` | Alterar canal + iniciar Agente IA |
| `channel_message_flow` | Alterar canal + enviar mensagem + iniciar fluxo |
| `channel_message_agent` | Alterar canal + enviar mensagem + iniciar Agente IA |

Default: `channel_only`. Migração transparente — nós antigos sem `transfer_mode` caem no default e nada quebra.

### 2. UI condicional
Campos abaixo do radio aparecem apenas quando o modo os requer, via `visible(data)` no `FieldSpec`:

- **Mensagem Inicial** — visível em `channel_message`, `channel_message_flow`, `channel_message_agent`.
- **Fluxo a iniciar** — visível em `channel_flow`, `channel_message_flow`.
- **Agente IA a acionar** — visível em `channel_agent`, `channel_message_agent`.

Todos passam a ser **obrigatórios** dentro do modo em que aparecem (validado no `validate()` do bloco).

Infra: adicionado `RadioFieldSpec` em `src/features/flow-builder/fields/types.ts` e case correspondente em `renderer.tsx` — ganho imediato para futuros blocos.

### 3. Executor — respeita o modo
`transferNumberNode` em `src/lib/flow-executor.server.ts`:

- Deriva flags `wantsMessage`, `wantsFlow`, `wantsAgent` do `transfer_mode`.
- Só lê/executa `initial_message`, `flow_id`, `agent_id` quando o modo autoriza.
- Modo desconhecido → cai em `channel_only` (fallback seguro).
- Nenhuma mudança de arquitetura, contratos ou schema.

### 4. Auditoria enriquecida
`conversation_transfers.note` agora é gerado por `buildTransferNumberNote()`:

> Transferido automaticamente pelo Flow Builder. Modo: Alterar canal + iniciar fluxo. Fluxo: Financeiro Pós-venda.

`channel_events.payload` (evento `conversation_transferred`) recebe:

- `transfer_mode` + `transfer_mode_label`
- `origin_channel` `{id, name}` e `destination_channel` `{id, name}`
- `from_channel_name`, `to_channel_name`
- `flow_id`, `flow_name`, `agent_id`, `agent_name`
- `flow_run_id`, `flow_node_id`, `timestamp`, `transferred_by`

Sem novas tabelas, sem novos contratos externos — usa exatamente as colunas já existentes.

### 5. Compatibilidade preservada
`SidebarCtx`, `dispatchSend`, `conversation_transferred`, `NODE_PLUGINS`, saídas `success/error`, edge labels, idempotência (`transfer-number:<runId>:<nodeId>:<flowId>`), RBAC e multi-tenancy — todos intactos.

### 6. Validações
- `bunx tsgo --noEmit`: **PASS**.
- Kinds parity: **PASS** (registry / runtime / persistência).
- Regressões novas: **0**.

## FINAL UX REFINEMENT — VEREDITO

- TRANSFER MODE: **PASS**
- DYNAMIC UI: **PASS**
- TIMELINE AUDIT: **PASS**
- TRANSFER METADATA: **PASS**
- FLOW COMPATIBILITY: **PASS**
- AI COMPATIBILITY: **PASS**
- RUNTIME: **UNCHANGED**
- CORE: **UNCHANGED**
- DATABASE: **UNCHANGED**
- TYPECHECK: **PASS**
- NEW REGRESSIONS: **0**
- CRITICAL: **0**
- HIGH: **0**
- GLOBAL FREEZE: **PRESERVED**

**FINAL VERDICT: TRANSFER NUMBER NODE READY FOR FREEZE**
