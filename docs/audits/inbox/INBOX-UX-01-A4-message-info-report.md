# INBOX-UX-01 · Grupo A · Item 4 — Informações da Mensagem

**Status:** ✅ Encerrada
**Data:** 2026-07-16
**Escopo:** Adicionar ação "Informações da mensagem" (Desktop + Mobile) exibindo apenas dados persistidos.

---

## 1. Objetivo

Reproduzir o painel "Message info" do WhatsApp Web utilizando exclusivamente dados já existentes na plataforma. Nenhuma alteração de schema, provider, Runtime Engine, RBAC, RLS ou Event Bus.

---

## 2. Implementação

### Backend
- **`getMessageInfo`** (`src/lib/inbox.functions.ts`) — server function autenticada via `requireSupabaseAuth`. Agrega, em leitura:
  - `messages` (linha completa)
  - `conversations` + `channels` (name, provider_type, phone_number)
  - `profiles` (operador, se `sender_user_id`)
  - `ai_agents` (agente IA, se `sender_agent_id`)
  - `messages` alvo do `reply_to_id`
  - `channel_events` filtrados por `payload.message_id` ou `payload.provider_message_id`
  - `flow_runs` best-effort (última run da conversa cujo janela cobre o `created_at` da mensagem)

RLS existente é respeitada — nada foi ampliado. Nenhuma escrita.

### Frontend
- **`MessageInfoSheet`** (`src/components/inbox/message-info-sheet.tsx`)
  - Sheet lateral (desktop) e bottom sheet (mobile) via prop `mobile`.
  - `useQuery` com `staleTime: 30s`.
  - Estados de loading (Skeleton) e erro (alert).
  - Todo campo nulo é renderizado como `Não disponível` (nunca inventado).
  - IDs (`message_id`, `provider_message_id`, `conversation_id`, `reply_to_id`, `flow_run_id`) são clicáveis para copiar.
- **`MessageActions`** (desktop) — nova ação "Informações da mensagem" no context menu e dropdown, entre Encaminhar e Selecionar.
- **`MobileMessageActionsSheet`** — mesma ação no bottom sheet do longo-press.
- **Rota `_authenticated.inbox.$conversationId.tsx`** — estado `infoMessageId`, wiring `onInfo` para ambos menus e renderização do sheet em desktop e mobile.

---

## 3. Campos exibidos

| Seção | Campo | Fonte |
| --- | --- | --- |
| Conteúdo | Corpo / preview do tipo | `messages.body`, `messages.type` |
| Detalhes | Tipo | `messages.type` |
| Detalhes | Direção | `messages.direction` |
| Detalhes | Status | `messages.status` |
| Detalhes | Criada em | `messages.created_at` |
| Detalhes | Falhou em | `messages.failed_at` |
| Detalhes | Tentativas | `messages.retry_count` |
| Detalhes | Erro (condicional) | `messages.error` |
| Detalhes | Excluída em / escopo / motivo (condicional) | `messages.deleted_at`, `deleted_scope`, `deleted_reason` |
| Canal | Nome | `channels.name` |
| Canal | Provider | `channels.provider_type` (label PT-BR) |
| Canal | Número | `channels.phone_number` |
| Identificadores | `message_id` | `messages.id` |
| Identificadores | `provider_message_id` | `messages.provider_message_id` |
| Identificadores | `conversation_id` | `messages.conversation_id` |
| Identificadores | `reply_to_id` | `messages.reply_to_id` |
| Responsável | Operador | `profiles.full_name` via `sender_user_id` |
| Responsável | Agente IA | `ai_agents.name` + `model` via `sender_agent_id` |
| Responsável | Origem (inbound) | Fallback: "Contato (mensagem recebida)" |
| Fluxo (condicional) | Nome / status / iniciado / concluído / `flow_run_id` | `flow_runs` + `flows.name` |
| Timeline | Eventos ligados à mensagem | `channel_events` filtrados por payload |

## 4. Campos declarados "Não disponível" na plataforma atual

Campos citados no escopo que **não têm coluna dedicada** no schema e, portanto, aparecem como "Não disponível" quando ausentes:

- **Data/hora de envio distinta da criação** — o schema mantém apenas `created_at` (momento em que a linha entrou no banco). Não há coluna `sent_at`/`delivered_at`/`read_at` separada.
- **Status ACK granular por destinatário** (delivered/read individuais). O `messages.status` é escalar. Eventos de ACK, quando existirem, aparecem na timeline via `channel_events`.
- **Usuário responsável em mensagens recebidas** — inbound não tem `sender_user_id`; renderizado como "Contato (mensagem recebida)".
- **Fluxo em mensagens não originadas por fluxo** — nenhum registro em `flow_runs` para a janela, a seção "Fluxo de origem" simplesmente não é renderizada (evita atribuição fictícia).

Nenhum dado é fabricado. Nenhum campo é inventado.

---

## 5. Validação

| Item | Resultado |
| --- | --- |
| `bunx tsgo --noEmit` | ✅ Sem erros |
| Playwright autenticado (desktop 1280×1800) | ✅ Menu de contexto → "Informações da mensagem" → sheet lateral renderiza com dados reais |
| Renderização de `Não disponível` | ✅ `provider_message_id`, `reply_to_id`, `Falhou em` |
| Origem inbound | ✅ "Contato (mensagem recebida)" |
| Canal / provider / número | ✅ Comercial · WhatsApp Cloud (Meta) · +55 11 90000-0000 |
| IDs copiáveis | ✅ `message_id`, `conversation_id` |

Evidência: `/tmp/browser/a4-info/screenshots/4_info_sheet.png` (captura do sheet aberto sobre a conversa).

Mensagens de imagem/áudio/documento e mensagens originadas por fluxo compartilham exatamente o mesmo painel; os campos correspondentes aparecem quando presentes no banco (ex.: `type = image`, `flowRun != null`) e são omitidos ou marcados "Não disponível" quando ausentes.

---

## 6. Arquivos alterados

- `src/lib/inbox.functions.ts` — nova server fn `getMessageInfo`.
- `src/components/inbox/message-info-sheet.tsx` — **novo** componente (sheet responsivo).
- `src/components/inbox/message-actions.tsx` — prop `onInfo` + item de menu (context + dropdown).
- `src/components/inbox/mobile/mobile-message-actions-sheet.tsx` — prop `onInfo` + item no bottom sheet.
- `src/routes/_authenticated.inbox.$conversationId.tsx` — estado `infoMessageId`, wiring e renderização em desktop e mobile.
- `docs/audits/inbox/INBOX-UX-01-A4-message-info-report.md` — este relatório.

---

## 7. Impacto na paridade

- Estado anterior (após Item 3): **~61,5%**
- Estado após Item 4: **~66% (+4,5 pp)** — fecha o Grupo A do roadmap.

---

## 8. Congelamento arquitetural

- Banco: **sem alterações** (nenhuma migration).
- Runtime Engine, Providers, RBAC, RLS, Event Bus: **sem alterações**.
- Novas dependências npm: **nenhuma**.
- Apenas leitura sob RLS existente + novos componentes de UI.

---

## 9. Decisão

**Encerrada.** Aguardando autorização explícita para iniciar o próximo item do Grupo A.
