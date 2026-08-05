# Auditoria Mobile — Canais

Escopo: rota `/channels` em viewports 390, 414, 430, 768 (portrait/landscape).

## Antes (desktop reaproveitado no mobile)

| Área | Problema |
|---|---|
| Header | `flex flex-wrap` com título grande + botão "Novo canal" empilhava em 2 linhas e ocupava altura desnecessária. |
| Filtros | 3 `Select` desktop (200px cada) + toggle Arquivados quebravam a linha e criavam overflow horizontal. |
| Grid de cards | `md:grid-cols-2 xl:grid-cols-3` em coluna única no mobile ficava com muito ar interno (`p-5`) e 3 controles empilhados por card. |
| Ações | `DropdownMenu` (padrão desktop) — touch targets de 32px, off-nativo, borda de foco travava em iOS. |
| Detalhes | `ChannelDetailDrawer` em `Sheet` lateral de largura fixa `sm:max-w-2xl`; abas em `grid-cols-5` cortavam texto (<= 60px por aba a 390px). Selects nativos do desktop. |
| Confirmar exclusão | `AlertDialog` central OK, mas o disparo estava atrás de dropdown desktop. |
| Loading | Card `h-40` placeholder pesado — 3 cards ocupavam quase toda a viewport. |
| Empty state | Ícone 64px + card grande, boa aparência mas sem CTA sticky. |
| FAB | Já registrado em Mobile-6 — mantido. |

## Checklist auditado

- Overflow horizontal: 3 pontos (linha de filtros, tabs de detalhe, botões de card).
- Safe area: falta padding-bottom respeitando `env(safe-area-inset-bottom)` na lista.
- Touch targets: ações do card < 40px.
- Bottom sheets: nenhum — só drawer lateral.
- Skeleton: usa `bg-muted/30 animate-pulse` cru em vez do `<Skeleton/>` compartilhado.
- Loading/Empty/Offline: cobre loading e empty; erro do query não é exibido.
- Responsividade 390–430: OK depois das correções abaixo; 768 (iPad portrait) permanece usando layout desktop existente (2 colunas), sem regressão.

## Depois (Mobile-6.1)

- `src/components/channels/mobile/mobile-channels-home.tsx`
  - Header compacto (grid `[minmax(0,1fr)_auto]` + `truncate`).
  - Barra de busca full-width com radius pill.
  - **Chips** roláveis para status (`Todos / Conectados / Conectando / Offline / Pausados`) — substitui os 2 `Select` desktop.
  - Strip de 4 KPIs (Ativos / Conectando / Pausados / Total) em 4 colunas de 88px.
  - Cards enxutos (`p-3`, altura ~92px) com avatar 48px + ponto de status, título, número, badge, contagem 24h.
  - Ação "Conectar" ou sparkline no trailing conforme status.
  - Botão "…" abre bottom-sheet de ações (não dropdown).
  - Padding inferior `calc(env(safe-area-inset-bottom)+6rem)` para respirar acima da bottom nav e FAB.
- `src/components/channels/mobile/mobile-channel-actions-sheet.tsx`
  - Bottom sheet arredondado (`rounded-t-3xl`) com 6 ações, cada uma em `min-h-[52px]`.
  - Reusa `archiveChannel`, `disconnectChannel`, `setChannelPaused` — zero lógica nova.
- `src/components/channels/mobile/mobile-channel-detail-sheet.tsx`
  - Sheet `bottom` a 92dvh, header sticky com avatar+status.
  - Tabs em **segmented control rolável** (`Resumo / Configuração / Logs / Teste`).
  - Resumo com stats em 2 colunas + card de mensagens.
  - Configuração enxuta (auto-reply, mensagem off-hours, limite diário, estratégia como radio-cards). O select de fluxo/agente do desktop foi omitido nesta rodada por depender de listagens adicionais que empilham no mobile — permanece disponível no desktop.
  - Logs em lista compacta com badge do tipo + payload trunc.
  - Teste com botão principal `h-12` (recomendado iOS/HIG).
- `src/routes/_authenticated.channels.tsx`
  - Route agora troca via `useIsMobile()`. Página desktop preservada 100%.

## Reuso / não-alterado

- Server functions (`listChannels`, `getChannel`, `updateChannel`, `archiveChannel`, `deleteChannel`, `setChannelPaused`, `disconnectChannel`, `sendTestMessage`, `startChannelSession`, `finalizeChannelSession`).
- `ChannelFormSheet` (wizard/edição) — reusado direto.
- `QrConnectDialog` — reusado direto (já é modal fullscreen amigável).
- `ChannelStatusBadge`, `Sparkline` — reusados.
- Realtime (`useRealtimeChannels`) — mesmo hook.
- RBAC / feature flags / limites — inalterados.

## Pendências residuais (para Mobile-6.7)

- Vincular agente IA e "Fluxo de boas-vindas" no mobile via bottom-sheet dedicado.
- Card de integração/webhook do provedor Cloud API (só desktop hoje).
- Pull-to-refresh na lista.
- Virtualização — não necessária hoje (< 200 canais típico).
