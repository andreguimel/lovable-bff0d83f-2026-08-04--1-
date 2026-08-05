# Mobile Improvements — Backlog priorizado (v1)

**Origem:** `docs/mobile/mobile-audit.md` (baseline Mobile-1).
**Escopo deste arquivo:** roteiro para as sub-missões Mobile-2 … Mobile-8. Nenhum módulo será alterado fora da sub-missão correspondente.

> Regra global: prioridade mobile ≥ desktop. Em conflito, ganha a usabilidade mobile sem comprometer funcionalidades essenciais.

---

## Sub-missão Mobile-2 — Inbox

- Substituir o layout master-detail do Inbox por uma pilha nativa mobile:
  - Lista de conversas full-width com item alto ≥ 72px.
  - Ao tocar, navega para `/inbox/$conversationId` em tela cheia.
  - Botão voltar contextual na Top Bar.
- Composer fixo ao teclado (input, anexos, áudio, emojis), sem zoom em iOS (`font-size ≥ 16px`).
- Suportar gestos: swipe-to-archive, long-press → menu de contexto (arquivar, marcar como não lida, atribuir).
- Áudio: gravador one-tap com waveform.
- Empty state dedicado mobile (o atual mostra "Selecione uma conversa" que não faz sentido sem lista visível).
- Registrar FAB "Nova conversa" via `useMobileFab`.

## Sub-missão Mobile-3 — CRM (score 58)

- Tabela `/crm` → cards de contato (avatar, nome, tags, último contato, ações).
- Toolbar de filtros em barra horizontal scrollable, chips 44px.
- "Novo contato" e "Importar/Exportar" viram FAB expandível + itens no Drawer contextual.
- `contact-form-sheet` migrar para bottom sheet com snap points.
- Perfil do contato (`/crm/$id`) em tela cheia com abas top-tab.

## Sub-missão Mobile-4 — Dashboard

- Widgets empilhados verticalmente, `min-width: 0`.
- Gráficos (Recharts) responsivos com `ResponsiveContainer` + `AspectRatio 16:9`.
- Cabeçalho "Comando de operação" compacto: título + toggle de período apenas.
- Ações rápidas ("Nova conversa" etc.) → BottomSheet acessado por FAB "+" ou removidas do topo.
- Scroll único no `<main>` do shell mobile; nenhum widget scrollable interno concorrente.

## Sub-missão Mobile-5 — Flows + Agents (score 82 / 70)

- **Flows canvas:** dois modos em mobile — Visualização (read-only, pan/zoom por gesto) e Simplificado (lista de nós agrupada por etapa).
- Editor de nó em Bottom Sheet full-height (`snap: 0.6 / 1`).
- Painéis desktop (`test-drawer`, `analytics-drawer`) precisam variante mobile em Bottom Sheet.
- **Agentes:** cards de agentes; playground de teste em tela cheia; prompt editor com textarea grande, toolbar compacta.

## Sub-missão Mobile-6 — Guardião + Campanhas + Reports

- Guardião: timeline em coluna única, cards de incidente com severidade colorida e ações em swipe.
- Campanhas: `campaign-wizard` já é um wizard — reforçar passo-a-passo vertical, indicador de progresso fixo topo, botão principal fixo bottom respeitando safe-area.
- Reports: gráficos com `ResponsiveContainer`, tabelas viram cards sumários; filtros em bottom sheet.

## Sub-missão Mobile-7 — Team + Settings + Channels (score 46 / 100 / 88)

- Team: tabela → cards de membro; permissões em bottom sheet; filtros rápidos em chips.
- Channels: `channel-form-sheet` e `channel-detail-drawer` migrar para bottom sheet mobile.
- Settings: agrupamento de seções em accordion, cada linha ≥ 56px, ícone + label + chevron.

## Sub-missão Mobile-8 — QA final + Perf + A11y

- Playwright em 7 breakpoints (390/414/430/768/820/1024/1366) com screenshots comparativos antes/depois.
- Lighthouse mobile — meta score ≥ 90 em cada rota principal.
- ARIA: labels em todos os icon buttons; landmarks (`<nav>`, `<main>`) corretos.
- Safe area: iPhone com Dynamic Island / notch, Android com barra gestual e três botões.
- Virtualização das listas longas (Inbox, CRM, Team) via `@tanstack/react-virtual`.
- Lazy-loading de módulos pesados (Recharts, canvas de fluxos, gravador de áudio).
- Dark Mode revisitado por rota mobile.

---

## Findings estruturados

| ID | Severidade | Categoria | Descrição | Sub-missão |
|---|---|---|---|---|
| A-M1-01 | High | touch-target | `/team` — 18 alvos < 44px em 390px | Mobile-7 |
| A-M1-02 | High | touch-target | `/crm` — 14 alvos < 44px | Mobile-3 |
| A-M1-03 | High | touch-target | `/agents` — 10 alvos < 44px | Mobile-5 |
| A-M1-04 | Medium | touch-target | `/quick-replies` (9), `/settings/audit` (7), `/flows` (6), `/reports` (6) | 5, 6, 7 |
| A-M1-05 | Low | text-clip | `/reports*` — 2 elementos `.truncate` cortados em 390px | Mobile-6 |
| A-M1-06 | Medium | layout-desktop | Tabelas herdadas do desktop em `/team`, `/crm`, `/agents`, `/channels`, `/quick-replies` | 3, 5, 7 |
| A-M1-07 | Medium | drawer-desktop | `channel-*-sheet`, `contact-form-sheet`, `playground-drawer` são side sheets desktop | 3, 5, 7 |
| A-M1-08 | Low | dashboard-widgets | Widgets com `min-width` fixo forçam scroll interno | Mobile-4 |

---

## Convenções para as próximas sub-missões

- Todo botão/toggle/link clicável em mobile: `min-h-11 min-w-11` (48px, `--touch-target`), com `@utility touch-target`.
- Cards padronizados: `rounded-2xl border-border/60 bg-card shadow-sm p-4`.
- Bottom sheets: usar `@/components/ui/drawer` (Vaul) com `snapPoints` explícitos; nunca uma modal centralizada em mobile.
- Registrar FAB por rota via `useMobileFab` no `useEffect` do componente; limpar no unmount.
- Nenhum scroll vertical duplicado: cada rota tem exatamente um wrapper `flex-1 overflow-y-auto momentum-scroll`.
- Framer Motion: animações 180–250ms, `ease-out`, sem exageros.
- Safe-area sempre via tokens `--safe-*` ou utilitários `safe-pt / safe-pb / safe-px`.

Este backlog será atualizado ao final de cada sub-missão com o delta de score e os novos itens descobertos.

---

## Mobile-02 — Inbox (concluída)

Escopo entregue: shell fullscreen em `/inbox/<id>`, lista mobile full-width com filtros em bottom sheet, header 56px com back/avatar/status/mais, mensagens em coluna única com bubbles WhatsApp-like, composer fixo com attach/mic/send + sheets para anexos/quick-replies/IA-Fluxos, sheet de contato e sheet de atribuição — tudo reutilizando os server functions e hooks existentes.

### Resíduos (não bloqueadores)

| ID | Severidade | Descrição | Próxima janela |
|----|-----------|-----------|----------------|
| M-M2-01 | Low | Gestos: swipe-para-arquivar/marcar-lida e long-press para seleção múltipla na lista mobile ainda não implementados (não há ações equivalentes no backend hoje). | Backlog |
| M-M2-02 | Medium | Virtualização (`react-virtual`) da lista de mensagens quando `> 200` items — atualmente renderiza tudo (aceitável para conversas ordinárias). | Mobile-08 |
| M-M2-03 | Low | Pull-to-refresh nativo — hoje o refresh acontece via realtime; o gesto está apenas visualmente disponível via overscroll. | Backlog |
| M-M2-04 | Low | Suite Playwright dedicada de Inbox mobile (envio de texto/mídia/áudio, rotação, teclado aberto) — a cobertura ampla acontece em Mobile-08. | Mobile-08 |

## Mobile-03 (CRM) — concluído
- Home mobile do CRM: cards, chips, filtros em bottom-sheet, Lista/Funil.
- Perfil em tela dedicada com tab pills, timeline, tarefas, notas, IA, arquivos.
- Kanban mobile com scroll-snap horizontal (sem drag).
- FAB "Novo contato" via MobileFab.
- Reuso total das server functions e das tabs existentes.

Backlog residual movido para Mobile-08: swipe gestures, virtualização, Playwright suite.

## Mobile-04 (Dashboard) — concluído
- Dashboard mobile exclusivo: hero (saudação, saúde, pendentes), range pills, KPIs 2×2, alertas priorizados, ações rápidas + FAB, IA e timeline.
- Reuso total das server fns e widgets existentes (mesma queryKey → cache compartilhado com desktop).
- OfflineBanner removido (sobrepunha bottom-nav mobile).

Backlog residual: personalização de layout mobile + Playwright dedicado.

## Mobile-6.1 (Canais) — concluído
- Home mobile dedicada com cards compactos, chips de status roláveis, strip de KPIs e sparkline por card.
- Bottom-sheet de ações substituindo o `DropdownMenu` desktop (targets ≥ 52px).
- Detalhe em bottom-sheet 92dvh com segmented control rolável (Resumo / Configuração / Logs / Teste).
- Reutilização direta de `ChannelFormSheet`, `QrConnectDialog`, `ChannelStatusBadge`, `Sparkline`, `useRealtimeChannels` e todas as server functions.
- Roteamento condicional via `useIsMobile()`; desktop preservado.
- Auditoria: `docs/mobile/mobile-channels-audit.md`.

Backlog residual → Mobile-6.7: bottom-sheet de agente IA / fluxo de boas-vindas, painel de credenciais Cloud API mobile, pull-to-refresh.

## Mobile-6.2 (Campanhas) — concluído
- Home mobile dedicada: cards com dot do canal, badge de status, progresso e 4 mini-métricas; busca pill; chips roláveis (7 status); KPI strip com notação compacta.
- Bottom-sheet de ações substituindo os botões inline desktop (7 ações contextuais, targets ≥ 52px).
- Detalhe em bottom-sheet 92dvh com segmented control rolável (Resumo / Estatísticas / Público / Mensagem) e refetch 2s em `sending`.
- `CampaignWizard` reusado sem alterações; server functions, realtime e RBAC inalterados.
- Roteamento via `useIsMobile()`; desktop preservado.
- Auditoria: `docs/mobile/mobile-campaigns-audit.md`.

Backlog residual → Mobile-6.7: timeline dedicada de execuções, sparkline temporal, aba Logs vinculada a `channel_events`, seletor de canal do wizard em bottom-sheet nativo.
