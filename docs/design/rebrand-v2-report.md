# Zenda Design System V2 — Rebrand Report

## Status: ✅ CONCLUÍDA (escopo fechado)

Escopo: apenas UI/UX (tokens, hero, landing). Zero mudanças em Backend, Banco, Runtime, Providers, RBAC, Server Functions, Event Bus, Segurança, Fluxos ou Mobile Navigation.

## Entregas

1. **Paleta V2 (violet enterprise)** — `src/styles.css`
   - Primary `oklch(0.58 0.24 285)` ≈ `#6D5EF7`
   - Ring/Input/Border realinhados ao hue violeta
   - Dark canvas `oklch(0.145 0.005 285)` ≈ `#09090B`
   - Dark card `oklch(0.18 0.005 285)` ≈ `#111113`
2. **Primitivo dark hero** — `src/components/ui/hero-section-dark.tsx`
   - Glow radial + grid mask reutilizáveis
3. **Zenda Hero** — `src/components/marketing/zenda-hero.tsx`
   - Título "Zenda AI CRM" com gradiente violet→purple
   - Subtítulo + descrição conforme brief
   - CTAs: "Entrar na Plataforma" (gradient) + "Agendar Demonstração" (ghost bordered)
   - Strip de 6 módulos (Inbox, CRM, Agentes IA, Fluxos, Campanhas, Guardião) — apenas ícones Lucide
   - Mock control center com 3 KPIs
4. **Landing (auth)** — `src/routes/auth.tsx`
   - Coluna esquerda substituída pelo `ZendaHero`
   - Formulário à direita intacto (nenhuma mudança em auth flow)

## Auditoria prévia

- Tailwind v4 (`@theme inline`) ✅ presente e usado
- shadcn (`components.json`, 46 primitivos em `src/components/ui/`) ✅
- Typescript strict ✅
- `lib/utils.ts` (`cn`) ✅
- Fonte Geist já carregada em `__root.tsx` via `<link>` ✅
- `lucide-react` ✅ instalado
- Tokens (radius, shadow, glass utility) ✅ presentes

Nada precisou ser criado do zero.

## Gates

- `bunx tsgo --noEmit` ✅ verde
- Zero regressão desktop (sidebar/topbar/dashboard preservados)
- Zero regressão mobile (MobileShell intacto)
- Bundle: hero é code-split via rota `/auth`

## Fora de escopo (backlog design)

- Refactor global de cards/tabs/dialogs para radius-24 unificado
- Motion premium (Framer Motion) por componente
- Command Palette redesign
- Dashboard hero completo (control center reformulado)

Registrado em `docs/design/design-system-v2.md`.
