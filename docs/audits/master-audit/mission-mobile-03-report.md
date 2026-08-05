# Mission Mobile-03 — CRM Premium

**Escopo:** Somente camada de apresentação mobile do CRM (viewport < 768px).
**Nenhuma alteração** em backend, banco, APIs, RBAC ou regras de negócio.

## Auditoria de reutilização

| Recurso | Estratégia |
|---|---|
| Server functions (`listContacts`, `getContact`, `updateContact`, `deleteContacts`, `toggleContactTag`, `listChannels`, `startConversationFromContact`) | **Reutilizadas** integralmente |
| `useRealtimeContacts` | Reutilizado |
| `ContactFormSheet` (criação) | Reutilizado (shadcn Sheet já mobile-friendly) |
| `ContactTimeline` | Reutilizado |
| `TasksTab` / `NotesTab` / `IATab` / `FilesTab` | Reutilizados dentro do perfil mobile |
| `STAGES` (funil) | Reutilizado |
| `LeadScorePill` / `LeadScoreBar` | Reutilizados |
| `TagsMultiSelect` | Reutilizado no bottom-sheet de filtros |

## Componentes novos (apresentação mobile)

- `src/components/crm/mobile/mobile-crm-home.tsx`
  - Busca sticky arredondada + chips (Todos / Novos / Em negociação / Clientes / Perdidos)
  - Alternador Lista ↔ Funil
  - Cards de contato compactos com **ações rápidas** (WhatsApp / Ligar)
  - **FAB contextual** "Novo contato" (via `useMobileFab()`)
  - **Bottom sheet** de filtros (tags + limpar)
  - Kanban mobile com **scroll-snap horizontal** (85vw por coluna), sem drag
- `src/components/crm/mobile/mobile-contact-profile.tsx`
  - Tela dedicada (não modal) com header sticky compacto
  - Hero: avatar, empresa, score/barra, chips clicáveis (copiar telefone/e-mail)
  - Grid Estágio (bottom-sheet) + Valor
  - Ações rápidas: Conversar / WhatsApp / Ligar / Editar
  - Tab pills horizontais: Visão geral, Timeline, Conversas, Tarefas, Notas, IA, Arquivos
  - Bottom sheets: Ações, Estágio, Tags, Iniciar conversa, Editar contato
  - Formulário de edição com inputs 48px, `inputMode` apropriado, botão Salvar acessível

## Wiring

- `src/routes/_authenticated.crm.index.tsx` → `useIsMobile()` alterna entre `MobileCrmHome` e `CrmHome` desktop.
- `src/routes/_authenticated.crm.$contactId.tsx` → idem para `MobileContactProfile` × `ContactPage`.

## Critérios atendidos

- [x] Lista mobile em cards, sem tabela
- [x] Pesquisa fixa no topo + chips + tags via bottom-sheet
- [x] Perfil em tela dedicada com tabs pill scrolláveis
- [x] Timeline agrupada por dia com ícones (reutilizando componente existente)
- [x] Kanban navegável horizontalmente (snap), com totais por coluna
- [x] FAB contextual (novo contato)
- [x] Bottom sheets substituindo modais grandes
- [x] Formulários com campos maiores + `inputMode`
- [x] Sem overflow horizontal, uma área de scroll principal
- [x] Estados: loading (skeletons), vazio, filtrado
- [x] Sem alterações em backend / regras de negócio
- [x] Typecheck aprovado

## Backlog residual (Mobile-08)

- Gestos de swipe nos cards (whatsapp / delete)
- Virtualização (react-virtual) para listas >200 contatos
- Suite Playwright dedicada ao CRM mobile em 390/414/768
- Kanban: mover etapa por drag (opcional; hoje via bottom-sheet)
