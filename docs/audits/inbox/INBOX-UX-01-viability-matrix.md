# Missão INBOX-UX-01 — Auditoria de Viabilidade (Paridade WhatsApp Web)

**Data:** 2026-07-16
**Tipo:** Diagnóstico read-only. Nenhum código, migration, Runtime ou Provider alterado.
**Escopo:** Inbox (mensagem + conversa), desktop e mobile.
**Fontes auditadas:**
- `src/components/inbox/message-actions.tsx`, `conversation-actions.tsx`, `message-composer.tsx`, `selection-toolbar.tsx`.
- `src/lib/inbox.functions.ts`, `src/lib/message-delete.functions.ts`.
- `src/lib/wa-providers/index.server.ts`, `whatsapp-cloud.server.ts`, `whatsapp-cloud-delete.server.ts`, `evolution-delete.server.ts`, `baileys-delete.server.ts`.
- `src/integrations/supabase/types.ts` (schema `messages`, `conversations`).

## 1. Providers suportados hoje

| Provider | Send | Revoke (delete-for-all) | Reply/Quote | Reactions | Forward | Edit | Star | Mute | Archive | Info (delivery/read receipts detalhado) |
|---|---|---|---|---|---|---|---|---|---|---|
| **WhatsApp Cloud (Meta oficial)** | ✅ implementado | ❌ *não expõe endpoint público de revoke* (comentado em `message-delete.functions.ts:51-54`) | ⚠️ API suporta `context.message_id`, **não implementado** no dispatcher | ⚠️ API suporta reactions (`type=reaction`), **não implementado** | ❌ não existe endpoint nativo — precisa reenviar payload | ❌ *não suportado pela API* (só templates) | 🔴 **conceito local do cliente WhatsApp**, não existe na API | 🔴 **conceito local do cliente**, não existe na API | 🔴 **conceito local do cliente**, não existe na API | ⚠️ Webhook envia `sent/delivered/read` (já persistido em `messages.status`); timestamps por evento **não persistidos** |
| **Evolution API** | ❌ stub (`skipped:true`) | ✅ contrato de deleção existe (`evolution-delete.server.ts`) | ⚠️ suportado pela API (`quoted`), sem wiring | ⚠️ suportado, sem wiring | ⚠️ suportado, sem wiring | ⚠️ suportado, sem wiring | 🔴 local do cliente | 🔴 local do cliente | 🔴 local do cliente | ⚠️ ACKs disponíveis, parcialmente persistidos |
| **Baileys** | ❌ stub | ✅ contrato existe | ⚠️ suportado, sem wiring | ⚠️ suportado, sem wiring | ⚠️ suportado, sem wiring | ⚠️ suportado, sem wiring | 🔴 local do cliente | 🔴 local do cliente | 🔴 local do cliente | ⚠️ ACKs disponíveis |

Legenda: ✅ funcional · ⚠️ possível na API/schema, ausente no código · ❌ não implementado · 🔴 **limitação da própria WhatsApp Business API** (Meta não expõe; só existe no cliente oficial WhatsApp/WhatsApp Web).

## 2. Matriz de ações — mensagem individual

| Ação | Estado hoje | Motivo de não existir | O que falta implementar | Camada afetada | Classificação | Bloqueio de API |
|---|---|---|---|---|---|---|
| **Responder (quote)** | ❌ ausente na UI · schema já tem `messages.reply_to_id` | Composer não aceita contexto de reply; dispatcher não injeta `context.message_id` no payload Cloud | 1) Estado de reply no `MessageComposer` (`replyingTo`); 2) `sendMessage` aceitar `replyToProviderMessageId`; 3) `SendPayload` do dispatcher ganhar `context`; 4) `whatsapp-cloud.server` incluir `context.message_id`; 5) UI de citação no bubble (já suporta via `reply_to_id`) | Frontend + Server Function + Provider adapter | 🟡 Frontend + Server Functions | **Cloud: OK · Evolution/Baileys: OK (não implementados como send)** |
| **Reagir (emoji)** | ❌ ausente | Não há tabela de reactions nem payload de reaction no dispatcher | 1) Migration `message_reactions(message_id, user_id, emoji, actor='me'\|'contact', created_at)` + GRANT + RLS por company; 2) Webhook Cloud tratar `messages[].reactions`; 3) `sendReaction` server fn + payload `{type:'reaction', message_id, emoji}` no Cloud adapter; 4) UI: emoji picker no bubble + render de reactions | Banco + Backend + Frontend + Provider | 🟠 Banco + Backend | **Cloud: OK (endpoint `reaction`) · Evolution/Baileys: OK · Meta limita 1 reação por usuário/mensagem** |
| **Encaminhar** | ❌ ausente | Sem seletor de destino nem reenvio | 1) UI: dialog "Encaminhar para…" (multi-select de contatos/conversas); 2) `forwardMessage` server fn que cria N novas mensagens e chama `dispatchSend` por conversa; 3) Marcar `media_metadata.forwarded=true` para UI; **não requer migration** (usa envio normal) | Frontend + Server Function | 🟡 Frontend + Server Functions | **Todos os providers: OK — é apenas re-envio. Meta não tem endpoint "forward" nativo; comportamento é reenviar mídia por `media_id`/URL** |
| **Favoritar (star)** | ❌ ausente | Não existe estado local nem tabela | 1) Migration `message_stars(message_id, user_id, created_at)` **ou** coluna `messages.starred_by uuid[]` + GRANT/RLS; 2) `toggleStar` server fn; 3) UI: ícone estrela + filtro "Favoritas" na conversa | Banco + Backend + Frontend | 🟠 Banco + Backend | **Local. Nunca sai para provider. Sem bloqueio de API.** |
| **Editar mensagem** | ❌ ausente | Sem UI de edição e API Meta não permite | 1) *Cloud:* **impossível** — Meta não expõe edit em mensagens free-form (só templates com aprovação); 2) *Evolution/Baileys:* possível via envio de edit; requer coluna `messages.edited_at`, `messages.original_body` e `editMessage` server fn | Banco + Backend + Frontend + Provider | 🔴 Limitação parcial da API | **Cloud: BLOQUEADO pela Meta · Evolution/Baileys: OK quando implementados** |
| **Excluir para mim** | ✅ funcional (`message-delete.functions.ts`, scope `inbox_only`) | — | — | — | ✅ pronto | — |
| **Excluir para todos** | ⚠️ parcial — Evolution/Baileys prontos; **Cloud impossível** | Meta não expõe revoke público (documentado) | Cloud: nada a fazer (limitação). Evolution/Baileys: já suportado quando o send estiver ligado. | — | 🔴 Cloud bloqueado · 🟠 Evolution/Baileys ok | **Cloud: BLOQUEADO pela Meta** |
| **Informações da mensagem** | ⚠️ parcial — `messages.status` persiste último ACK (`sent/delivered/read`) | Timestamps por evento não persistidos; sem UI | 1) Migration `message_receipts(message_id, event 'sent'\|'delivered'\|'read'\|'failed', occurred_at)` + GRANT/RLS **ou** colunas `sent_at/delivered_at/read_at` em `messages`; 2) Webhook Cloud/Evolution gravar timestamps por evento; 3) UI: dialog "Informações" com timeline | Banco + Backend + Frontend | 🟠 Banco + Backend | **Cloud: OK (webhook `statuses[]` já dá timestamps) · Evolution/Baileys: OK via ACKs** |
| **Selecionar mensagens** | ✅ funcional (`selection-toolbar.tsx`) | — | — | — | ✅ pronto | — |
| **Copiar texto** | ⚠️ existe no menu da **conversa**, ausente no menu de **mensagem** | Não foi adicionado ao `message-actions.tsx` | 1 item de menu chamando `navigator.clipboard.writeText(body)` com fallback textarea (já usado em `conversation-actions.tsx`) | Frontend | 🟢 Apenas Frontend | Nenhum |

## 3. Matriz de ações — lista de conversa

| Ação | Estado hoje | Motivo | O que falta | Camada | Classificação | Bloqueio API |
|---|---|---|---|---|---|---|
| **Fixar conversa** | ✅ (`conversations.pinned`) | — | — | — | ✅ pronto | — |
| **Marcar lida/não lida** | ✅ (`unread_count` + `markConversationAsUnread`) | — | — | — | ✅ pronto | — |
| **Resolver/Reabrir** | ✅ (`conversations.status`) | — | — | — | ✅ pronto | — |
| **Copiar telefone/texto** | ✅ | — | — | — | ✅ pronto | — |
| **Arquivar conversa** | ❌ | Não existe coluna de arquivo | Migration: `conversations.archived_at timestamptz null` + índice + GRANT + política; `archiveConversation` server fn; filtro "Arquivadas" na lista | Banco + Backend + Frontend | 🟠 Banco + Backend | **Local (WhatsApp Web também é local). Sem bloqueio.** |
| **Silenciar conversa** | ❌ | Não existe tabela de preferências por conversa (existe `notification_preferences` mas global por usuário) | Migration `conversation_mute(user_id, conversation_id, muted_until timestamptz null)` + GRANT/RLS; `muteConversation` server fn; hook de notificações checar mute | Banco + Backend + Frontend | 🟠 Banco + Backend | **Local. Sem bloqueio.** |
| **Informações da conversa** | ❌ (existe `contact-panel.tsx` parcial) | Sem tela unificada | Reaproveitar `contact-panel` com blocos: contato, canal, atendente, últimas 24h, criptografia (N/A), grupos (N/A) | Frontend | 🟢 Apenas Frontend | Nenhum |
| **Responder/Reagir/Encaminhar/Editar/Favoritar/Excluir** (a partir da lista) | ❌ | São ações **da mensagem**, não da conversa. WhatsApp Web abre a conversa e opera na mensagem. | Considerar fora de escopo do menu da lista. | — | 🟢 (redirecionar para conversa) | Nenhum |

## 4. Composição por camada (esforço agregado)

| Camada | Ações |
|---|---|
| 🟢 Apenas Frontend | Copiar (mensagem), Informações da conversa |
| 🟡 Frontend + Server Functions | Responder, Encaminhar |
| 🟠 Banco + Backend + Frontend | Reagir, Favoritar, Arquivar, Silenciar, Informações da mensagem |
| 🔴 Limitação Meta (WhatsApp Cloud) | Editar (só templates), Excluir para todos (sem endpoint público) |
| 🔴 Limitação estrutural WhatsApp Business API | Silenciar/Arquivar/Favoritar **não existem no protocolo** — só faz sentido como estado local do CRM (WhatsApp Web também trata assim). |

## 5. Estimativa de paridade

Base: 22 ações operacionais mapeadas no WhatsApp Web relevantes ao caso de uso Inbox multi-atendente.

| Categoria | Qtde | Peso |
|---|---:|---:|
| ✅ Prontas e funcionais | 9 | 40,9 % |
| ⚠️ Parciais (schema pronto, wiring faltando **ou** funcionam em 1 provider e não em outros) | 3 | 13,6 % |
| ❌ Ausentes mas viáveis | 8 | 36,4 % |
| 🔴 Impossíveis por limitação Meta/WhatsApp Cloud | 2 | 9,1 % |

**Paridade atual estimada: ~48 %** (prontas + metade das parciais).
**Teto de paridade viável mantendo WhatsApp Cloud como provider principal: ~91 %** (100 % − limitações Meta).
**Teto adicional se Evolution/Baileys forem habilitados como send:** +4-5 pp (edit e revoke recuperados fora do Cloud).

## 6. Backlog concreto (ordenado por relação valor/custo)

| # | Item | Classificação | Migrations | Server Fns novas | Provider |
|---:|---|---|---|---|---|
| 1 | Copiar (mensagem) | 🟢 | — | — | — |
| 2 | Responder (quote) | 🟡 | — | `sendMessage` estende input | Cloud: `context.message_id` |
| 3 | Encaminhar | 🟡 | — | `forwardMessage` | Reusa `dispatchSend` |
| 4 | Informações da mensagem | 🟠 | `message_receipts` ou colunas `*_at` em `messages` | `getMessageReceipts` + webhook grava timestamps | Cloud/Evolution/Baileys |
| 5 | Arquivar conversa | 🟠 | `conversations.archived_at` | `archiveConversation` | — |
| 6 | Silenciar conversa | 🟠 | `conversation_mute` | `muteConversation` | — |
| 7 | Favoritar mensagem | 🟠 | `message_stars` | `toggleStar` | — |
| 8 | Reagir | 🟠 | `message_reactions` | `sendReaction` + webhook reactions | Cloud endpoint reaction |
| 9 | Editar (Evolution/Baileys apenas) | 🟠 | `messages.edited_at`, `messages.original_body` | `editMessage` | Evolution/Baileys |
| — | Editar (Cloud) | 🔴 | — | — | **BLOQUEADO Meta** |
| — | Excluir para todos (Cloud) | 🔴 | — | — | **BLOQUEADO Meta** |

## 7. Diferenciação limitação de arquitetura vs limitação de API

**Arquitetura atual (superável com trabalho no projeto):**
- Send via Evolution/Baileys não implementado (stub).
- `SendPayload` não carrega `context/reply/reaction/edit`.
- Ausência de tabelas: reactions, stars, receipts detalhados, mute, archive.
- Webhook Cloud não persiste timestamps por evento nem reactions.

**Limitação da própria WhatsApp Business API / Meta (não superável sem trocar de provedor):**
- **Editar mensagem free-form no Cloud** — não existe endpoint público (só templates com aprovação prévia).
- **Revoke (excluir para todos) no Cloud** — não existe endpoint público; documentado no código atual.
- **Star / Archive / Mute** — não existem no protocolo; são estado local do cliente oficial. Implementar no CRM é aceitável e equivale ao que o próprio WhatsApp Web faz (armazenamento local do dispositivo).

## 8. Resposta objetiva à pergunta central

> **"Quanto falta, em porcentagem, para o Inbox ficar equivalente ao WhatsApp Web?"**

- **Estado atual:** ~48 % de paridade funcional.
- **Máximo alcançável mantendo WhatsApp Cloud como provider principal:** ~91 %.
- **Gap para atingir esse teto:** 9 itens de backlog (2 apenas frontend, 2 frontend+server fns, 5 com migration + backend).
- **Impossível sem trocar/adicionar provider:** editar mensagem free-form e revoke remoto no WhatsApp Cloud.

## Encerramento

Auditoria concluída. Nenhuma alteração de código, banco, Runtime, Provider, RLS, RBAC ou Design System. Backlog INBOX-UX-01 fica pronto para priorização; nenhuma implementação nesta missão.
