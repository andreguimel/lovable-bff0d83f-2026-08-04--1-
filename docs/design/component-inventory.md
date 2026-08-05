# Component Inventory — Zenda V2

## shadcn primitivos (`src/components/ui/`) — 47 arquivos

accordion · alert-dialog · alert · aspect-ratio · avatar · badge · breadcrumb · button · calendar · card · carousel · chart · checkbox · collapsible · command · context-menu · dialog · drawer · dropdown-menu · empty-state · form · hero-section-dark ⭐ (novo) · hover-card · input-otp · input · label · menubar · navigation-menu · pagination · popover · progress · radio-group · resizable · scroll-area · select · separator · sheet · sidebar · skeleton · slider · sonner · switch · table · tabs · textarea · toggle-group · toggle · tooltip

## Marketing (`src/components/marketing/`)

- `zenda-hero.tsx` ⭐ (novo)

## Consistência

- Todos os primitivos usam tokens semânticos (`bg-card`, `text-foreground`, `border`, `ring`).
- Nenhum primitivo hard-coda cores hex.
- V2 alterou apenas os valores dos tokens — API dos componentes intacta.

## Débito conhecido (backlog, não bloqueia)

- Alguns módulos (`agents/studio`, `flows/studio`, `crm/profile`) mantêm classes utilitárias antigas; comportam-se corretamente com nova paleta mas podem ser polidos.
- Command Palette merece hero-treatment (glow + backdrop) — pendente.
