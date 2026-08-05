# Mission Mobile-1 — Auditoria + Fundação de Shell Mobile

**Data:** 2026-07-15
**Escopo:** apenas infraestrutura de navegação mobile. Nenhum módulo (Inbox, CRM, Dashboard, Fluxos, Agentes, Guardião, Equipe, Campanhas) foi alterado.
**Regras respeitadas:**
- Sem alterações de backend, banco, APIs, regras de negócio.
- Sem novas funcionalidades.
- Sem refatorações estruturais.
- Correção só de infraestrutura: shell, tokens, wrappers.

---

## Entregáveis

| Item | Caminho |
|---|---|
| Auditoria completa (screenshots + JSON + score) | `docs/mobile/mobile-audit.md` · `docs/audits/master-audit/evidence/mobile-01/` |
| Backlog priorizado das próximas sub-missões | `docs/mobile/mobile-improvements.md` |
| Shell mobile — orquestrador | `src/components/mobile/mobile-shell.tsx` |
| Top App Bar mobile | `src/components/mobile/mobile-top-bar.tsx` |
| Bottom Navigation | `src/components/mobile/mobile-bottom-nav.tsx` |
| Drawer lateral | `src/components/mobile/mobile-drawer.tsx` |
| FAB contextual | `src/components/mobile/mobile-fab.tsx` |
| Hook viewport SSR-safe | `src/hooks/use-mobile.tsx` |
| Layout condicional (desktop/mobile) | `src/routes/_authenticated.tsx` |
| Meta viewport + safe-area + theme-color | `src/routes/__root.tsx` |
| Tokens e utilitários mobile | `src/styles.css` |

## Diffs de infraestrutura

### 1. Viewport + PWA hints (`src/routes/__root.tsx`)
- `viewport-fit=cover` habilitado para safe-area no iPhone com notch/Dynamic Island.
- `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `theme-color` (light/dark).

### 2. Tokens (`src/styles.css`)
- `--touch-target: 48px`
- `--safe-top/bottom/left/right` via `env(safe-area-inset-*)`
- `--topbar-h: 56px`, `--bottomnav-h: 64px`

### 3. Utilitários novos
- `@utility touch-target` — `min-height/width: 48px`
- `@utility safe-pt / safe-pb / safe-px` — padding respeitando safe-area
- `@utility no-tap-highlight`
- `@utility momentum-scroll` — momentum + overscroll contain

### 4. Hook `useIsMobile`
- SSR-safe (`typeof window` guard no `useState` initializer).
- Sincroniza via `matchMedia`, sem thrashing em resize.
- Sem flash desktop-first no primeiro render mobile.

### 5. Layout `_authenticated`
- `useIsMobile()` chaveia entre:
  - **Desktop (≥ 768px):** `SidebarProvider + AppSidebar + AppTopbar + <Outlet/>` (idêntico ao anterior).
  - **Mobile (< 768px):** `SidebarProvider + MobileShell + <Outlet/>` — `SidebarProvider` mantido para compatibilidade com componentes que usam `useSidebar`.

### 6. Componentes mobile
- **MobileTopBar (56px + safe-top):** botão Menu (abre Drawer) · título dinâmico via `useRouterState` + mapa de rotas · Popover de notificações · dropdown de conta.
- **MobileBottomNav (64px + safe-bottom):** 5 slots — Início, Inbox (com badge não-lidas), CRM, Fluxos, Menu. Padrão Material 3 / iOS moderno: pill com blur, item ativo destacado (primary com fundo `primary/12`), badge com ring.
- **MobileDrawer:** side-left, animação suave (shadcn `Sheet`); avatar + email + toggle dark; busca de módulos; favoritos persistidos em `localStorage`; grupos Atendimento / Automação / Configuração; logout no rodapé.
- **MobileFab:** `MobileFabProvider` + `useMobileFab()` + `MobileFabSlot`. API pronta para os módulos registrarem seus FABs contextuais nas sub-missões 2..7.

---

## Auditoria — resumo

**64 combinações** rota × viewport auditadas (16 rotas × 4 viewports).

| Métrica | Resultado |
|---|---|
| Overflow horizontal | **0** de 64 (100% limpo) |
| Rotas com score < 60 | **1** (`/team`) |
| Rotas com score < 80 | 5 |
| Rotas com score 100 | 5 |
| **Global Mobile Readiness Score** | **83 / 100** |

Detalhamento por rota, screenshots, findings e backlog em `docs/mobile/mobile-audit.md` e `docs/mobile/mobile-improvements.md`.

---

## Critérios de encerramento

- [x] Auditoria completa gerada e arquivada.
- [x] Shell mobile funcional em ≤ 767px (Top Bar + Bottom Nav + Drawer + FAB slot).
- [x] Drawer abre/fecha suavemente e navega para **todos** os módulos.
- [x] Bottom Nav destaca item ativo, respeita safe-area, tem badges reais para Inbox.
- [x] Tokens mobile publicados e utilitários disponíveis.
- [x] `useIsMobile` estável, SSR-safe, sem flash.
- [x] Nenhuma regressão em desktop (validado em screenshots `laptop_*`).
- [x] `tsgo --noEmit` verde.
- [x] Relatórios gerados: `mobile-audit.md`, `mobile-improvements.md`, `mission-mobile-01-report.md`.
- [x] `production-verdict.md` atualizado.

**Usuário já consegue navegar por toda a plataforma no mobile usando apenas Top Bar + Bottom Nav + Drawer, mesmo com as telas ainda em formato desktop.** Este era o critério de aceite explícito da Mobile-1.

---

## Próximo passo

Aguardar autorização do usuário para iniciar **Mobile-2 (Inbox)**, seguindo a ordem revisada:
Mobile-2 Inbox → Mobile-3 CRM → Mobile-4 Fluxos+Agentes → Mobile-5 Dashboard → Mobile-6 Guardião+Campanhas+Reports → Mobile-7 Equipe+Ajustes+Canais → Mobile-8 QA final.
