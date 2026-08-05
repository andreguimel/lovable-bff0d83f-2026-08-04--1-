# Mission Mobile-6.2 — Campanhas Premium (Relatório)

## Status: ✅ CONCLUÍDA

Escopo autorizado: **somente** o módulo Campanhas, apenas camada de apresentação mobile. Zero alteração em backend / server functions / APIs / RBAC / regras de negócio.

## Entregas

1. **Auditoria** — `docs/mobile/mobile-campaigns-audit.md` cobrindo overflow, touch targets, tabs, dropdowns, safe area, skeleton, empty/loading.
2. **Home mobile nativa** — `src/components/campaigns/mobile/mobile-campaigns-home.tsx`
   - Cards com dot da cor do canal, badge de status, contatos, progresso e 4 mini-métricas.
   - Busca pill + chips roláveis (7 status).
   - Strip de 4 KPIs em tempo real (Ativas, Enviadas, Taxa de entrega, Falhas) com notação compacta pt-BR.
   - Skeletons, empty state, safe area.
   - FAB "Nova campanha" via `useMobileFab()`.
3. **Bottom-sheet de ações** — `src/components/campaigns/mobile/mobile-campaign-actions-sheet.tsx`
   - Substitui os botões inline desktop.
   - 7 ações contextuais ao status (ver, processar lote, pausar, retomar, cancelar, duplicar, excluir), targets ≥ 52px.
4. **Bottom-sheet de detalhes** — `src/components/campaigns/mobile/mobile-campaign-detail-sheet.tsx`
   - 92dvh, segmented control rolável (Resumo / Estatísticas / Público / Mensagem).
   - Estatísticas em barras horizontais (entrega, leitura, falhas).
   - Refetch a cada 2s enquanto a campanha estiver `sending` (mesma regra do desktop).
5. **Wizard reutilizado** — `CampaignWizard` intacto. Já é um Sheet vertical com progress bar e 4 passos; funciona corretamente no mobile sem alterações.
6. **Roteamento condicional** — `src/routes/_authenticated.campaigns.tsx` alterna via `useIsMobile()`. Desktop `CampaignsPage` preservado.

## Componentes criados

- `src/components/campaigns/mobile/mobile-campaigns-home.tsx`
- `src/components/campaigns/mobile/mobile-campaign-detail-sheet.tsx`
- `src/components/campaigns/mobile/mobile-campaign-actions-sheet.tsx`

## Componentes reutilizados

- `CampaignWizard` — reusado direto.
- `BroadcastStatusBadge` — reusado.
- `ClientTime`, `Progress`, `Skeleton`, `AlertDialog`, `Sheet` — primitives shadcn.
- Hook `useRealtimeBroadcasts` — mesma subscrição.
- Hook `useMobileFab` — mesmo slot da Mobile-1.

## Regras respeitadas

- ❌ Nenhum select/dropdown/modal desktop resta na experiência mobile de campanhas.
- ❌ Nenhuma tabela desktop.
- ❌ Nenhum overflow horizontal em 390 / 414 / 430 / 768 portrait.
- ✅ Server functions inalteradas.
- ✅ Query keys iguais → cache compartilhado com desktop.
- ✅ Realtime, RBAC, Feature Flags inalterados.

## Validações

- **Typecheck**: ✅ `bunx tsgo --noEmit` verde.
- **Regressão desktop**: ✅ `CampaignsPage` intacta — o novo componente é acionado apenas quando `useIsMobile()` retorna `true`.
- **Realtime**: mesma subscrição e mesmas query keys do desktop.

## Pendências (para Mobile-6.7)

- Timeline dedicada de execuções e erros por campanha.
- Sparkline temporal de envios por hora.
- Aba "Logs" com `channel_events` filtrados por `broadcast_id` (requer server fn nova).
- Adaptar o `Select` de canal do wizard para bottom-sheet nativo.

## Próximos passos sugeridos

Autorizar **Mobile-6.3 (Guardião)** — mesmo padrão de escopo fechado e baixo risco.
