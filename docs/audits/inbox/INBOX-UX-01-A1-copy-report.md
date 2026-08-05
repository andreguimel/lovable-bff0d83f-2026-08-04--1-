# Missão INBOX-UX-01 · Grupo A · Item 1 — Copiar texto (mensagem)

**Data:** 2026-07-16
**Escopo:** Adicionar ação "Copiar" ao menu (dropdown + context menu) das mensagens no Inbox desktop.
**Não tocado:** Runtime, Providers, Banco, RBAC, RLS, Event Bus, Design System global, arquitetura, mobile sheet (já possuía Copiar funcional).

## Causa raiz

`MessageActions` (desktop) não expunha ação de copiar. Mobile (`mobile-message-actions-sheet.tsx`) já tinha `Copiar` implementado desde a Fase 3 do Inbox. Faltava paridade no desktop, item #1 do Grupo A do roadmap.

## Alterações

| Arquivo | Mudança |
|---|---|
| `src/components/inbox/message-actions.tsx` | +Prop `body?: string \| null`; +item **Copiar** no `DropdownMenu` e `ContextMenu`; +helper `copyToClipboard` com fallback textarea (mesmo padrão de `conversation-actions.tsx`) para browsers que negam Clipboard API; toast de sucesso/erro via `sonner`. |
| `src/routes/_authenticated.inbox.$conversationId.tsx` | Passa `body={m.body}` ao `<MessageActions>`. |

Nenhuma migration. Nenhuma server function nova. Nenhum provider tocado.

## Comportamento

- Texto vazio/whitespace → item **Copiar** aparece `disabled`.
- Clipboard API disponível → `navigator.clipboard.writeText(body)`.
- Clipboard API indisponível/negada → fallback `document.execCommand('copy')` via `<textarea>` fora da tela.
- Sucesso → `toast.success("Mensagem copiada")`. Falha → `toast.error("Não foi possível copiar")`.
- Aplica-se igualmente a mensagens `inbound` e `outbound`, em todos os tipos com body textual (texto, caption de imagem/vídeo, transcrições que caem em `body`). Mensagens `deleted` continuam sem menu (tombstone).

## Validação

- **Typecheck:** `bunx tsgo --noEmit` → 0 erros.
- **Playwright (autenticado, sessão real):**
  - Menu de contexto abre em bubble outbound.
  - Itens renderizados na ordem: `Copiar`, `Selecionar mensagem`, `Excluir para mim (local)`, `Excluir para todos`, `Remover apenas do inbox`.
  - Clique em **Copiar** → `navigator.clipboard.readText() === "oi"` (body real da mensagem).
  - Screenshots: `/tmp/browser/inbox-copy/shots3/02_ctx.png`, `/tmp/browser/inbox-copy/shots3/03_after.png`.
- **Mobile:** já funcional desde Fase 3 (nada alterado).

## Ganho de paridade

- **Antes:** ~48 %.
- **Depois deste item:** ~52,5 % (+4,5 pp, conforme roadmap).

## Decisão

**Encerrada.**

Aguardando autorização explícita antes de iniciar o próximo item do Grupo A (Responder/quote — valor 5, complexidade 2, ROI 2,5). Não iniciar automaticamente.
