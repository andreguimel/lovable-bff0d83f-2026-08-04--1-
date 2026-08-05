# Mission Mobile-6.1 — Canais Premium (Relatório)

## Status: ✅ CONCLUÍDA

Escopo autorizado: **somente** o módulo Canais, apenas camada de apresentação mobile, sem tocar backend / banco / APIs / RBAC / regras de negócio.

## Entregas

1. **Auditoria** — `docs/mobile/mobile-channels-audit.md` cobrindo overflow, touch targets, tabs, dropdowns, safe area, loading/empty.
2. **Home mobile nativa** — `src/components/channels/mobile/mobile-channels-home.tsx`
   - Cards compactos (avatar + status dot, nome, número, badge, msgs 24h, sparkline).
   - Busca em pill full-width.
   - **Chips** de status roláveis (substituem os `Select` desktop).
   - Strip de 4 KPIs.
   - Empty state, loading skeleton, safe area padding.
   - FAB "Novo canal" reutilizado via `useMobileFab()`.
3. **Bottom-sheet de ações** — `src/components/channels/mobile/mobile-channel-actions-sheet.tsx`
   - Substitui o `DropdownMenu` desktop.
   - 6 ações (detalhes, editar, conectar/desconectar, pausar/retomar, arquivar, excluir), targets ≥ 52px.
4. **Bottom-sheet de detalhes** — `src/components/channels/mobile/mobile-channel-detail-sheet.tsx`
   - Sheet 92dvh, segmented control rolável (`Resumo / Configuração / Logs / Teste`).
   - Reusa `getChannel`, `updateChannel`, `sendTestMessage`.
5. **Roteamento condicional** — `src/routes/_authenticated.channels.tsx` agora troca desktop ↔ mobile via `useIsMobile()`. Zero regressão desktop.
6. **Reutilização** — `ChannelFormSheet` (wizard/edição) e `QrConnectDialog` reusados diretos; `ChannelStatusBadge` e `Sparkline` idem.

## Regras respeitadas

- ❌ Nenhum select/dropdown/dialog desktop resta na experiência mobile de canais.
- ❌ Nenhuma tabela desktop.
- ❌ Nenhum overflow horizontal em 390 / 414 / 430 / 768 portrait.
- ✅ Server functions inalteradas.
- ✅ Realtime inalterado (`useRealtimeChannels`).
- ✅ RBAC / Feature Flags / Limites inalterados.

## Validações

- **Typecheck**: ✅ `bunx tsgo --noEmit` verde.
- **Regressão desktop**: ✅ desktop `ChannelsPage` intacto — o novo componente é acionado apenas quando `useIsMobile()` retorna `true`.
- **Realtime**: mesma subscrição do desktop, mesmo query key `["channels"]`.

## Fora de escopo desta missão (proposto para Mobile-6.7)

- Bottom sheet dedicado para vincular Agente IA / Fluxo de boas-vindas.
- Painel de credenciais/webhook do provedor Cloud API no mobile.
- Pull-to-refresh nativo.
- Testes E2E Playwright mobile específicos.

## Próximos passos sugeridos

Autorizar **Mobile-6.2 (Campanhas)** — mesma disciplina, escopo fechado, baixo risco.
