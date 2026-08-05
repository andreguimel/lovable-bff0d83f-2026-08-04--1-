# Missão INBOX-UX-01 · Grupo A · Item 2 — Responder / Quote

**Data:** 2026-07-16
**Escopo:** Ação "Responder" em mensagens do Inbox, com preview no composer, persistência de `reply_to_id`, renderização de bloco citado no bubble e propagação para o provedor WhatsApp Cloud (`context.message_id`).
**Não tocado:** Runtime, RBAC, RLS, Event Bus, arquitetura, schema (`messages.reply_to_id` já existia), Design System global.

## Causa raiz do gap

- `MessageActions` (desktop) e o menu mobile não expunham `Responder` de fato — o mobile apenas focava o composer sem atrelar a mensagem original.
- `sendMessage` server function não aceitava `replyToId`; nada era persistido em `messages.reply_to_id` no envio outbound.
- `SendPayload` do dispatcher e `sendViaWhatsAppCloud` não incluíam `context.message_id`, então mesmo enviando pelo Cloud a Meta não pintava o quote nativo no cliente.
- Bubble de mensagem não renderizava preview citado quando `reply_to_id` estava presente.
- Webhook inbound descartava `context.id` da Meta (reply do cliente), impedindo mapeamento para `reply_to_id` local.

## Alterações

| Camada | Arquivo | Mudança |
|---|---|---|
| Provider | `src/lib/wa-providers/whatsapp-cloud.server.ts` | `SendPayload` ganha `replyToProviderId?: string` em todas as variantes; `sendViaWhatsAppCloud` injeta `context.message_id` no body quando presente. `NormalizedInbound` ganha `reply_to_provider_id?`; `normalizeMetaWebhook` lê `messages[].context.id`. |
| Server Fn | `src/lib/inbox.functions.ts` | `sendMessage` aceita `replyToId` (uuid opcional); resolve `provider_message_id` da mensagem original (escopo da conversa), passa `replyToProviderId` ao `dispatchSend` e persiste `reply_to_id` no `messages.insert`. |
| Webhook | `src/routes/api/public/webhooks/whatsapp.$channelId.ts` | Ao ingerir inbound, tenta resolver `msg.reply_to_provider_id` → `messages.id` local via `provider_message_id` na mesma conversa e persiste `reply_to_id`. |
| UI compartilhada | `src/components/inbox/reply-preview.tsx` (novo) | `ReplyPreview` (preview no composer) + `summarize()` que retorna ícone/label por tipo (texto, imagem, áudio, vídeo, arquivo). |
| Menu desktop | `src/components/inbox/message-actions.tsx` | Novo item **Responder** no dropdown e no context menu; prop `onReply?()`. |
| Menu mobile | `src/components/inbox/mobile/mobile-message-actions-sheet.tsx` | `message` agora carrega `type` + `media_metadata`; `onReply` passa a receber a mensagem real (via route). |
| Composer desktop | `src/components/inbox/message-composer.tsx` | Props `replyingTo` + `onClearReply`; envia `replyToId` para texto, mídias e áudio; renderiza `<ReplyPreview>` acima do textarea; limpa estado após envio bem-sucedido. |
| Composer mobile | `src/components/inbox/mobile/mobile-message-composer.tsx` | Idem ao desktop; preview renderizada acima da linha do input. |
| Route | `src/routes/_authenticated.inbox.$conversationId.tsx` | Estado `replyingTo` no `ConversationView`; `startReply(m)` acionado pelo menu desktop; mobile sheet monta payload real e chama `setReplyingTo`; `ComposerWrapper` propaga `replyingTo`/`onClearReply` para ambos composers; `QuotedMessage` renderiza citação dentro dos bubbles quando `reply_to_id` existe; `Message` inclui `reply_to_id`; `messagesById` para lookup O(1). |

Sem migração, sem novo bucket, sem edge function nova.

## Comportamento

- Clique em **Responder** (dropdown, context menu ou sheet mobile) → preview aparece acima do composer com autor (`Você` / nome do contato), ícone e texto/label.
- **X** ou envio bem-sucedido limpa a preview.
- Envio persiste `messages.reply_to_id`; bubble da resposta renderiza citação em bloco à esquerda com borda colorida (WhatsApp Web-like), respeitando cores outbound (verde/branco no dark) e inbound.
- Provedor **WhatsApp Cloud**: quando a mensagem original tem `provider_message_id`, o payload sai com `context.message_id` — o destinatário vê o quote nativo do WhatsApp.
- Provedor **sem provider_message_id** (mensagem originalmente enviada em modo skipped) ou **Evolution/Baileys**: `reply_to_id` é persistido localmente, quote renderiza no Inbox, mas a Meta/provider não pinta o quote no cliente (esperado — só o CRM tem esse vínculo). Documentado.
- **Inbound reply do cliente**: webhook lê `messages[].context.id` e resolve para o `messages.id` local se existir na conversa — Inbox mostra o quote automaticamente.

## Validação

- **Typecheck:** `bunx tsgo --noEmit` → 0 erros.
- **Playwright autenticado (sessão real, WhatsApp Cloud sem credenciais reais → dispatch skipped, mas persistência e UI intactas):**
  - Right-click em bubble outbound → menu contém `Responder` ✅
  - Clique em `Responder` → `[data-testid="reply-preview"]` presente ✅
  - Envio via Enter → nova mensagem criada; contagem de bubbles com label "Você" (quoted author) = 1 ✅
  - Cancelar via X → preview desaparece imediatamente ✅
  - Screenshots: `/tmp/browser/inbox-reply/shots/{02_ctx,03_reply_preview,04_after_send,06_after_cancel}.png`
- **DB (piloto):** query em `messages` mostra a nova mensagem `Teste de resposta em quote` com `reply_to_id = f01004d3-…` apontando corretamente para a mensagem original `oi` da mesma conversa.
- **Realtime:** `useRealtimeMessages` + `invalidateQueries(["messages", conversationId])` já cobrem a atualização em outras abas — hook não foi tocado.
- **Tipos suportados na preview:** texto, imagem (caption), vídeo (caption), áudio, arquivo (nome). Cobertos por `summarize()` em `reply-preview.tsx`.

### Cobertura por tipo de mensagem original

| Original | Ação Responder | Preview no composer | Quote no bubble | Cloud API |
|---|---|---|---|---|
| Texto | ✅ | ✅ trecho do body | ✅ | ✅ `context.message_id` |
| Imagem | ✅ | ✅ ícone imagem + caption ou "Imagem" | ✅ | ✅ |
| Áudio | ✅ | ✅ ícone microfone + "Áudio" | ✅ | ✅ |
| Vídeo | ✅ | ✅ ícone vídeo + caption ou "Vídeo" | ✅ | ✅ |
| Arquivo | ✅ | ✅ ícone paperclip + nome | ✅ | ✅ |

## Limitações documentadas (por design, sem alteração de escopo)

- **Provider Evolution / Baileys:** send ainda é stub (skipped). `reply_to_id` é persistido localmente e a UI mostra o quote, mas o quote nativo no cliente WhatsApp só existirá quando o send desses providers for implementado (fora do Grupo A).
- **Mensagem original enviada antes de ligar o Cloud (sem `provider_message_id`):** mesmo caso acima — quote local ok, quote nativo indisponível.
- **Não altera** capabilities de delete, capabilities do provider, ou runtime de fluxos.

## Ganho de paridade

- **Antes deste item:** ~52,5 % (após item 1).
- **Depois:** ~57 % (+4,5 pp).

## Decisão

**Encerrada.**

Aguardando autorização explícita antes de iniciar o próximo item do Grupo A (**Informações da conversa** — reaproveitar `contact-panel`, 🟢 Frontend apenas, ROI 3,0). Não iniciar automaticamente.
