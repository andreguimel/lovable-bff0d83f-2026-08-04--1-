# ZENDA — MENSAGENS RÁPIDAS FINALIZATION 01

**Status:** MENSAGENS RÁPIDAS INTERNALLY COMPLETE / FROZEN
**Data:** 2026-07-21

## 1. Arquitetura

- Rota: `src/routes/_authenticated.quick-replies.tsx` (gerência) e integração
  no `src/components/inbox/message-composer.tsx` (uso operacional).
- Server functions: `src/lib/quick-replies.functions.ts`
  (`listQuickReplies`, `upsertQuickReply`, `deleteQuickReply`, `createFolder`,
  `deleteFolder`) — todas com `requireSupabaseAuth`.
- Tabelas: `public.quick_replies` e `public.quick_reply_folders`.

## 2. Schema & RLS

Ambas as tabelas com RLS ativa e política única `ALL` restrita a
`company_id = current_company_id()` (USING + WITH CHECK). `quick_replies`
possui `UNIQUE (company_id, shortcut)` — duplicate safety no banco.

## 3. Segurança

- Auth obrigatória via `requireSupabaseAuth`.
- Tenant/direct-id: RLS aplica USING no UPDATE/DELETE, então `.eq("id",…)`
  sem filtro por company retorna 0 rows para IDs de outro tenant. BLOCKED.
- Zod: `shortcut` regex `^\/[a-zA-Z0-9_-]+$`, len 2–60; `title` 1–120; `body`
  1–4000; `folder_id` uuid opcional. Payload limitado.
- XSS: composer usa React text render + `setText(...)`; **sem**
  `dangerouslySetInnerHTML`. Placeholder `{{nome}}` é substituição regex
  local, sem eval. Conteúdo malicioso `<script>` fica como texto.

## 4. Integração Inbox (NÃO reabriu Inbox)

`applyQuickReply(body)` em `message-composer.tsx` linhas 246–251:

```
setText(replaced); setShowQR(false); textareaRef.current?.focus();
```

- **NO AUTO-SEND**: apenas preenche o textarea. Envio permanece manual via
  `sendMut` (linha 157).
- **CONVERSATION PRESERVED**: nenhuma manipulação de `conversationId`.
- **DEFAULT CHANNEL CONTINUITY**: `channelOverride` e
  `channelCtx.defaultChannelId` não são tocados pela seleção do QR.
- **MANUAL OVERRIDE PRESERVED**: idem — o override manual sobrevive.
- **PARALLEL SEND PIPELINE**: ausente. QR usa o mesmo `sendMessage` do Inbox.

## 5. Estados & UX

- Rota de gestão exibe loading, empty state ("Nenhuma mensagem rápida
  encontrada.") e mutações com feedback via toast.
- Composer QR: busca por atalho/título/body case-insensitive; fallback "/"
  abre painel; `Esc` fecha.
- Responsivo desktop + mobile (`mobile-message-composer.tsx` também
  consome `listQuickReplies`).

## 6. Cenário canônico WebMarcas

5 registros (Saudação `/ola`, Registro `/registro`, Pagamento `/pagamento`,
Financeiro `/financeiro`, Jurídico `/juridico`) validados via contrato:

- CREATE/UPDATE/DELETE via `upsertQuickReply` + `deleteQuickReply`.
- SEARCH client-side por shortcut/title/body — filtra `/registro` e
  `/financeiro`.
- UNIQUE(company_id, shortcut) impede segundo `/registro` no mesmo tenant;
  Company B pode ter o seu.

## 7. Testes / Regressão

- `bunx tsgo --noEmit` → PASS (0 erros).
- Regressão manual: Inbox, CRM, Team, Funnel, Guardian, Analytics, Dashboard,
  Core — nenhum arquivo dessas áreas foi alterado nesta missão.

## 8. Backlog POST-V1 (não bloqueia freeze)

- Placeholders expandidos (`{{contact.name}}`, `{{company.name}}`).
- Contador de uso (`usage_count`) — não existe hoje, marcado N/A.
- Favoritos, versionamento, import/export — POST-V1.

---

## Veredito

**MENSAGENS RÁPIDAS INTERNALLY COMPLETE / FROZEN.**
