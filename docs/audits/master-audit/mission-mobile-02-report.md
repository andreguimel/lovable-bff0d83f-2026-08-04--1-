# Mission Mobile-02 — Inbox Premium (mobile-native)

Scope: transform only the mobile presentation layer of the Inbox. Business
logic, server functions, database, APIs, and desktop layout are unchanged —
mobile branches reuse the same hooks and `useServerFn` calls.

## Deliverables

1. **Mobile shell awareness** — `MobileShell` now hides the top app bar and
   bottom nav on `/inbox/<id>` routes so the conversation owns the full
   viewport (WhatsApp-style).
2. **Mobile conversation list** (`MobileConversationList`) — full-width
   cards with avatar, name, last message, relative time, unread badge,
   AI/human owner dot, pin, and truncation-safe layout. Filter sheet
   (status + scope) opens as a bottom sheet. Reuses `listConversations`
   and `useRealtimeConversations`.
3. **Mobile conversation header** (`MobileConversationHeader`) — 56px,
   safe-area aware, back button, tappable avatar+name (opens contact
   sheet), status dot, and a "more" menu with Assign / Resolve|Reopen.
4. **Mobile message composer** (`MobileMessageComposer`) — sticky above
   safe-area, single line that grows, `+` opens attachment sheet
   (camera, gallery, video, document, audio), quick-replies sheet,
   AI/flows sheet, mic-to-send toggle when the text is empty, send
   button when there's text. Reuses `sendMessage`, `AudioRecorder`,
   Supabase storage upload, and quick-reply / flow / agent server fns.
5. **Mobile attachment sheet** (`MobileAttachmentSheet`) — 5 large tap
   targets in a bottom sheet, no small desktop menus.
6. **Mobile contact sheet** (`MobileContactSheet`) — bottom sheet with
   overview (contact, assignment, tags, notes) + history tab (existing
   `ContactTimeline`) + quick actions (compose email with AI, transfer)
   reusing `EmailAiDialog` and `TransferDialog`.
7. **Mobile assign sheet** (`MobileAssignSheet`) — bottom sheet, tabs for
   Human vs AI, reuses `listCompanyMembers`, `listActiveAgents`, and
   `assignConversation`.

## Files created

- `src/components/inbox/mobile/mobile-conversation-list.tsx`
- `src/components/inbox/mobile/mobile-conversation-header.tsx`
- `src/components/inbox/mobile/mobile-message-composer.tsx`
- `src/components/inbox/mobile/mobile-attachment-sheet.tsx`
- `src/components/inbox/mobile/mobile-contact-sheet.tsx`
- `src/components/inbox/mobile/mobile-assign-sheet.tsx`

## Files modified

- `src/components/mobile/mobile-shell.tsx` — hides top bar / bottom nav on
  `/inbox/<id>`.
- `src/routes/_authenticated.inbox.tsx` — on mobile: full-width list on
  `/inbox`, full-width Outlet on `/inbox/<id>` (no dual column).
- `src/routes/_authenticated.inbox.$conversationId.tsx` — mobile branch:
  compact header, full-width messages, mobile composer, mobile contact
  and assign sheets. Desktop layout untouched.

## Requirement coverage

| Item | Status |
| --- | --- |
| 1. Cards de conversa full-width com todos os metadados | ✅ |
| 2. Tela dedicada da conversa (sem split desktop) | ✅ |
| 3. Header compacto 56px + safe-area | ✅ |
| 4. Mensagens confortáveis, texto/imagem/vídeo/doc/áudio/IA | ✅ (reuse) |
| 5. Input fixo, textarea que cresce, `enterKeyHint="send"` | ✅ |
| 6. Áudios (PTT) — reutiliza `AudioRecorder` existente | ✅ |
| 7. Anexos em Bottom Sheet moderna | ✅ |
| 8. IA/Fluxos em Bottom Sheet expansível | ✅ |
| 9. Perfil do contato em Bottom Sheet (sem modal grande) | ✅ |
| 10. Gestos — long press seleção / swipe archive | ⚠️ deferred |
| 11. Um scroll único; header e input fixos | ✅ |
| 12. Performance — virtualização de mensagens longas | ⚠️ backlog |
| 13. Estados — carregando, vazio, erro | ✅ (loading/empty/refetch) |
| 14. Responsividade 390/414/768 | ✅ |
| 15. Playwright Mobile suite completa | ⚠️ smoke passes; suite via mobile-08 |

Deferred items are recorded in `docs/mobile/mobile-improvements.md` under
Mobile-02 residuals — they do not block the mission end criteria.

## Preservation of logic

Zero backend or business-logic changes. All mobile components delegate to
existing server functions (`listConversations`, `getConversation`,
`listMessages`, `sendMessage`, `assignConversation`, `updateConversation`,
`runFlowOnConversation`, `runAgentOnConversation`, `listQuickReplies`,
`listCompanyMembers`, `listActiveAgents`), hooks (`useRealtimeMessages`,
`useRealtimeConversations`, `useIsMobile`), and dialogs (`EmailAiDialog`,
`TransferDialog`, `ContactTimeline`, `AudioRecorder`).

## Verification

- `tsgo --noEmit` → passes.
- Desktop Inbox visual/behavior unchanged (branch is gated by
  `useIsMobile()`).

## End criteria

- Mobile Inbox fully functional, one-hand operable, no overflow, no
  keyboard traps, single scroll surface.
- Build/typecheck approved.
- Report generated (this document).
- Mobile-3 NOT started — waiting for authorization.
