# Zenda Design System V2

## Identidade

Inspiração: **Linear · Attio · Stripe · Vercel · OpenAI · Arc · Notion AI · Raycast · Clerk · Resend**.

Atributos: Premium · Minimalista · Enterprise · IA-First · Elegância · Alta performance.

## Paleta

| Token | Valor | Uso |
|-------|-------|-----|
| Primary | `#6D5EF7` / `oklch(0.58 0.24 285)` | Ações principais, ring, links |
| Secondary | `#8B5CF6` | Gradient stops, badges |
| Accent | `#A855F7` | Highlights, sparkles |
| Background (dark) | `#09090B` | Canvas |
| Card (dark) | `#111113` | Superfícies elevadas |
| Border | `rgba(255,255,255,.08)` | Divisores em dark |
| Success | `#22C55E` | Deltas positivos |
| Warning | `#F59E0B` | Alertas |
| Danger | `#EF4444` | Destrutivo |

## Tipografia

- Display / Sans: **Geist**, fallback Inter, SF Pro
- Mono: **Geist Mono**
- Hierarquia inspirada em Linear (letter-spacing negativo em headings, `-0.02em`)

## Tokens

- Radius: 6 / 10 / 14 / 20 / 28 / 36 (`--radius-sm..3xl`)
- Shadow: xs / sm / md / lg / glow (glow em primary)
- Glass: `@utility glass` (blur 14px, saturate 180%)
- Focus ring: 2px offset + 4px `ring/55%`

## Componentes-chave

- `ui/hero-section-dark.tsx` — primitivo (glow + grid)
- `marketing/zenda-hero.tsx` — landing hero Zenda

## Diretrizes

- **Ícones**: apenas `lucide-react`
- **Cores em JSX**: sempre via tokens semânticos (`text-primary`, `bg-card`); literais `#hex` apenas em hero marketing dark isolado
- **Gradient primary**: `from-[#6D5EF7] to-[#8B5CF6]`
- **Radius padrão de cards**: `rounded-2xl` (16px) / hero `rounded-3xl` (24px)
