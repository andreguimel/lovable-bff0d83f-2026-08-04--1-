# Auditoria Mobile — Campanhas

Escopo: rota `/campaigns` em 390 / 414 / 430 / 768 (portrait/landscape).

## Antes (desktop reaproveitado no mobile)

| Área | Problema |
|---|---|
| Header | `flex justify-between` com título + botão "Nova campanha" — o botão vaza no mobile porque não trunca o subtítulo. |
| Filtros | `Select` de 176px para status, sem chips rápidos. Difícil trocar rapidamente entre "Ativas / Agendadas / Pausadas". |
| KPIs | Grid 2×4 com cards `p-4`, altura ~72px, sem indicação visual de tom. |
| Cards | `p-5` interno, com 3 zonas empilhadas (título, progresso, métricas 4 cols, ações). Botões "Processar" / "Duplicar" tinham altura 32px — abaixo dos 44px HIG. |
| Ações | 2 botões inline no card + nenhum menu → sem "Pausar / Retomar / Cancelar / Excluir" acessíveis diretamente na home. Precisava abrir o drawer para tudo. |
| Detalhe | `ChannelDetailDrawer` (Sheet lateral `sm:max-w-2xl`) com tabs "Mensagem / Destinatários" — ocupa a viewport mas com paddings e badges pequenos. |
| Loading | `<p>Carregando…</p>` puro, sem skeleton. |
| Empty | Card genérico sem CTA proeminente. |
| Wizard | Já usa Sheet vertical (`sm:max-w-lg`) com 4 passos — funcional no mobile; adaptações cosméticas apenas. |
| FAB | Já registrado em Mobile-6 (mantido). |

## Checklist auditado

- Overflow horizontal: 1 ponto (linha de filtros do desktop).
- Safe area: sem `env(safe-area-inset-bottom)` no rodapé da lista.
- Touch targets: `Button size="sm"` (h=32px) em ações do card — abaixo dos 44px.
- Bottom sheets: nenhum — só drawer lateral.
- Skeleton: ausente.
- Loading/Empty/Offline: só loading rudimentar; empty é card raso.
- Responsividade 390–430: OK após ajustes; 768 (iPad portrait) segue no layout desktop existente sem regressão.

## Depois (Mobile-6.2)

- `src/components/campaigns/mobile/mobile-campaigns-home.tsx`
  - Header enxuto com subtítulo dinâmico (ativas + taxa de entrega).
  - Barra de busca pill full-width.
  - **Chips** roláveis para status (`Todas / Ativas / Agendadas / Pausadas / Finalizadas / Erro / Rascunhos`) — substitui o `Select` desktop.
  - Strip de 4 KPIs em tempo real: Ativas, Enviadas (compact), Entrega %, Falhas (compact) — usa notação compacta pt-BR para números grandes.
  - Cards compactos (`p-3`) com dot da cor do canal, título, badge de status, canal, contatos, progresso, 4 métricas mini, timestamp contextual.
  - Botão "…" abre bottom-sheet de ações (não dropdown).
  - Empty state e skeletons (`h-28` por card, 4 shells).
  - Padding inferior `calc(env(safe-area-inset-bottom)+6rem)` para respirar acima do bottom-nav + FAB.
- `src/components/campaigns/mobile/mobile-campaign-actions-sheet.tsx`
  - Bottom sheet com 6 ações: ver detalhes, processar lote, pausar, retomar, cancelar, duplicar, excluir.
  - Cada linha `min-h-[52px]`, ícone em cápsula, tone `destructive` para excluir.
  - Ações condicionais ao status (`sending` → pausar/processar; `paused` → retomar; etc.).
- `src/components/campaigns/mobile/mobile-campaign-detail-sheet.tsx`
  - Sheet `bottom` 92dvh, header sticky com status + canal + start time.
  - **Segmented control rolável** com abas Resumo / Estatísticas / Público / Mensagem — substitui `Tabs grid-cols-N` que corta texto.
  - **Estatísticas** em barras horizontais (Entrega, Leitura, Falhas) — visualização clara mesmo sem gráficos pesados.
  - **Público** lista destinatários em cards com badge de status.
  - **Refetch a cada 2s** enquanto `sending` — mesma regra do desktop (query key `["broadcast", id]`).
- `src/routes/_authenticated.campaigns.tsx`
  - Roteamento via `useIsMobile()`. Desktop preservado 100%.

## Reuso / não-alterado

- Server functions: `listBroadcasts`, `getBroadcast`, `pauseBroadcast`, `resumeBroadcast`, `cancelBroadcast`, `duplicateBroadcast`, `deleteBroadcast`, `sendBroadcastBatch`, `previewAudience`, `scheduleBroadcast`, `createBroadcast`, `updateBroadcast`, `listChannelsForBroadcast`, `listTagsForBroadcast`.
- Componentes: `CampaignWizard` (reusado direto — já é Sheet vertical com 4 passos e progress bar; funciona bem no mobile), `BroadcastStatusBadge`.
- Hooks: `useRealtimeBroadcasts`, `useMobileFab`.
- Query keys inalteradas → cache compartilhado com desktop.
- RBAC / Feature Flags / regras de business → intactos.

## Pendências residuais (para Mobile-6.7)

- Timeline dedicada de execuções/pausas/erros por campanha (hoje mostrada só via lista de destinatários).
- Gráficos temporais de envio (sparkline por hora).
- Aba "Logs" com eventos `channel_events` filtrados por `broadcast_id` (requer server fn nova — fora do escopo desta missão).
- Bottom-sheet específico do seletor de canal do wizard (o `Select` do wizard continua desktop — funcional no mobile).
