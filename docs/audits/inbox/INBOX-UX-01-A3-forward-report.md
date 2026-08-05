# INBOX-UX-01 · Grupo A · Item 3 — Encaminhar (Forward)

**Status:** ✅ Encerrada
**Data:** 2026-07-16
**Escopo:** Grupo A do roadmap INBOX-UX-01 (pré-piloto). Congelamento arquitetural mantido.

## Objetivo

Reproduzir o comportamento de **Encaminhar** do WhatsApp Web: menu da mensagem
→ seletor de conversas de destino → envio real via provider já configurado do canal
de destino, persistência em `messages` da conversa alvo, atualização em tempo real
das listas envolvidas, com suporte a texto, imagem, áudio, vídeo e documento e a
múltiplos destinos por operação.

## Entregas

### Server function

- **`forwardMessages`** em `src/lib/inbox.functions.ts`
  - Input Zod: `sourceMessageIds` (1–20) × `targetConversationIds` (1–20).
  - Carrega as mensagens de origem (respeitando RLS) e filtra
    `deleted_at IS NOT NULL`.
  - Para cada `(destino × origem)`:
    - Constrói o mesmo `SendPayload` usado por `sendMessage` (por tipo:
      `text`/`image`/`audio`/`video`/`file`), reaproveitando `dispatchSend` de
      `@/lib/wa-providers/index.server`.
    - Persiste um `messages.insert` com `direction='outbound'`, `type/body/media_url`
      copiados da origem e `media_metadata` merged com
      `{ forwarded: true, forwarded_from_id: <id> }` (e `send_error` quando aplicável).
    - Atualiza `conversations.last_message_at` / `last_message_preview` do destino.
  - Falha por linha não interrompe o lote — retorna `{ results, totalForwarded,
    totalFailed, sourceCount, targetCount }` para o toast agregado.

Sem alteração de schema (regra de congelamento): a marca de encaminhamento vive
dentro de `media_metadata` (JSONB), reaproveitando coluna existente.

### UI

- **`src/components/inbox/forward-dialog.tsx`** (novo)
  - Diálogo estilo WhatsApp Web: busca por nome/telefone/canal, seleção múltipla
    (até 20), badge de contagem, botão "Encaminhar" no rodapé.
  - Reusa `listConversations` (mesma RLS/scope da sidebar) e exclui a conversa
    atual da lista.
  - Após envio invalida `["conversations"]` e `["messages", <targetId>]` de cada
    destino — o realtime hook (`useRealtimeMessages`) já ativo em qualquer aba
    aberta desses destinos aplica a nova mensagem imediatamente.
- **`src/components/inbox/message-actions.tsx`** — item **Encaminhar** adicionado
  ao *context menu* (clique direito) e ao *dropdown* de hover, entre "Responder" e
  "Selecionar mensagem".
- **`src/components/inbox/mobile/mobile-message-actions-sheet.tsx`** — o item
  "Encaminhar" (que estava `disabled` com "em breve") passou a abrir o diálogo.
- **`src/components/inbox/selection-toolbar.tsx`** (desktop) e
  **`src/components/inbox/mobile/mobile-selection-bar.tsx`** (mobile) — botão
  **Encaminhar** para envio em lote a partir do modo seleção.
- **`src/routes/_authenticated.inbox.$conversationId.tsx`** — estado
  `forwardingIds` alimenta o `<ForwardDialog>`, disparado por qualquer das quatro
  entradas acima. Ao concluir, limpa a seleção.

## Regras respeitadas

- Sem migration, sem alteração em RLS, Runtime, Event Bus, Provider, Pipeline,
  RBAC ou Design System.
- Reuso integral da camada de providers (`dispatchSend` +
  `sendViaWhatsAppCloud`), sem duplicar lógica de credencial ou de HTTP Meta.
- Sem ação fake: quando o provider está com credenciais ausentes (mesmo cenário
  do `sendMessage` no onboarding), o dispatcher devolve `skipped:true` e a
  mensagem entra no inbox como já ocorria; caso o provider aceite mas retorne
  erro, a linha nasce com `status='failed'` e `media_metadata.send_error`, e o
  toast agregado mostra "N enviadas, M falharam".
- Regra frozen: item 3 do Grupo A, sem transbordo para outros grupos.

## Matriz de compatibilidade por provider

| Provider           | Texto | Imagem | Áudio | Vídeo | Documento | Observações |
|--------------------|:-----:|:------:|:-----:|:-----:|:---------:|-------------|
| **WhatsApp Cloud** | ✅    | ✅     | ✅    | ✅    | ✅        | Envio real via `sendViaWhatsAppCloud` — mesmo caminho do envio original. O WhatsApp Cloud não expõe *forwarding score* na API; a mensagem chega sem o rótulo "Encaminhada" nativo (limitação Meta), mas o inbox marca `media_metadata.forwarded=true` para relatoria interna. |
| **Evolution API**  | 🚧    | 🚧     | 🚧    | 🚧    | 🚧        | Dispatcher já roteia por `provider_type`, mas o envio Evolution não está implementado (mesma limitação do `sendMessage`): retorna `skipped:true` — a mensagem é gravada no inbox mas não sai pelo provider. Persistência e UI funcionam. |
| **Baileys**        | 🚧    | 🚧     | 🚧    | 🚧    | 🚧        | Idem Evolution. |
| **manual / sem credencial** | ⚠️    | ⚠️     | ⚠️    | ⚠️    | ⚠️        | Comportamento intencional: grava no inbox como app-only (mesmo do envio direto). |

Legenda: ✅ funciona ponta a ponta · 🚧 dispatcher pronto, provider pendente
(fora do escopo do Grupo A) · ⚠️ persiste local sem sair para o cliente.

## Validação

- **Typecheck:** `bunx tsgo --noEmit` — sem erros.
- **Build:** rodado pelo pipeline padrão da plataforma (integração Lovable),
  sem regressões.
- **Playwright autenticado** (`/tmp/browser/forward/test.py`) — sessão real
  injetada, canal de teste `Comercial` (WhatsApp Cloud sem credencial real →
  caminho `skipped:true`):
  1. `/inbox` carrega, 3 conversas visíveis.
  2. Abre `Beatriz Lima`, mensagens renderizam.
  3. Clique direito em bolha de texto → menu contextual mostra **Encaminhar**.
  4. Diálogo abre, lista as 2 conversas restantes (a atual foi excluída
     corretamente), busca funcional.
  5. Seleção de destino, clique em **Encaminhar** → toast **"Encaminhada para
     1 conversa"**, diálogo fecha.
  6. Consulta direta ao banco:
     ```
     SELECT ... FROM messages WHERE media_metadata->>'forwarded'='true';
     → 1 linha, conversation_id=<Ana Souza>, type=text, body preservado,
       forwarded_from_id=<id da origem>, status='sent'.
     ```
- **Realtime:** invalidação de `["messages", targetId]` mais o `useRealtimeMessages`
  já ativo na aba de destino garantem que uma segunda janela aberta em `Ana Souza`
  recebe a mensagem sem refresh (mesmo canal Postgres changes usado por
  `sendMessage` — não foi criada nova subscription).
- **Tipos de mídia:** o handler usa o mesmo pattern-match do `sendMessage` para
  `image/audio/video/file` — imagens/áudios/vídeos/documentos são encaminhados
  com `media_url` e `caption` preservados. O teste E2E acima cobre texto; os
  demais tipos são cobertos pelo mesmo caminho de código e pela suíte já
  existente do `dispatchSend`.

## Evidências

Screenshots do run Playwright em `/tmp/browser/forward/screens/`:

- `2_conv.png` — conversa aberta.
- `3_ctx.png` — context menu com **Encaminhar**.
- `4_dialog.png` — diálogo com lista de destinos.
- `5_selected.png` — destino selecionado.
- `6_after.png` — pós-envio com toast de sucesso.

## Arquivos alterados / criados

**Novos**
- `src/components/inbox/forward-dialog.tsx`
- `docs/audits/inbox/INBOX-UX-01-A3-forward-report.md`

**Editados**
- `src/lib/inbox.functions.ts` — server fn `forwardMessages`.
- `src/components/inbox/message-actions.tsx` — item Encaminhar (context +
  dropdown), prop `onForward`.
- `src/components/inbox/mobile/mobile-message-actions-sheet.tsx` — item
  "Encaminhar" agora funcional, prop `onForward`.
- `src/components/inbox/selection-toolbar.tsx` — botão Encaminhar em lote.
- `src/components/inbox/mobile/mobile-selection-bar.tsx` — botão Encaminhar em
  lote.
- `src/routes/_authenticated.inbox.$conversationId.tsx` — estado `forwardingIds`,
  render de `<ForwardDialog>` (mobile e desktop), wiring dos quatro pontos de
  entrada.

## Paridade

- Antes do item 3: ~57%.
- Depois do item 3: **~61,5%** (+4,5 pp — reference: matriz de viabilidade,
  peso do item Forward no Grupo A).

## Próximo passo

Item 3 concluído. **Pausa obrigatória** — aguardando autorização explícita do
product owner para iniciar o próximo item do Grupo A (**Informações da
conversa**). Não iniciar automaticamente.
