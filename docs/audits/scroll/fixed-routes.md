# Rotas Corrigidas — RC3.1

Uma única correção no shell autenticado propagou para todas as rotas listadas abaixo. Nenhuma edição por rota foi necessária.

## Fix

**Arquivo**: `src/routes/_authenticated.tsx`
**Linha**: 62
**Correção**: `<main overflow-hidden>` → `<main overflow-y-auto overflow-x-hidden overscroll-contain>`

## Rotas cujo scroll ficou destravado

| Rota | Container-raiz da rota | Antes | Depois |
|------|------------------------|:-----:|:------:|
| `/` | `<div className="flex flex-col ...">` (dashboard shell) | ❌ | ✅ |
| `/crm` | `<div className="flex flex-col gap-5 p-4 md:p-6">` | ❌ | ✅ |
| `/crm/$contactId` | `<div ... p-6>` | ❌ | ✅ |
| `/team` | `<div className="flex flex-col gap-5 p-4 md:p-6">` | ❌ | ✅ |
| `/team/$memberId` | studio wrapper | ❌ | ✅ |
| `/team/roles` | roles panel | ❌ | ✅ |
| `/channels` | `<div className="flex flex-col gap-4 p-4 md:p-6">` | ❌ | ✅ |
| `/campaigns` | `<div className="flex flex-col gap-4 p-4 md:p-6">` | ❌ | ✅ |
| `/cascades` | idem | ❌ | ✅ |
| `/funnels` | idem | ❌ | ✅ |
| `/agents` | `<div className="flex flex-col gap-5 p-4 md:p-6">` | ❌ | ✅ |
| `/flows` | `<div className="flex flex-col gap-5 p-4 md:p-6">` | ❌ | ✅ |
| `/flows/$flowId/runs` | listagem | ❌ | ✅ |
| `/quick-replies` | idem | ❌ | ✅ |
| `/reports` (index e filhos) | tabs + tabelas | ❌ | ✅ |
| `/settings/*` | painéis longos | ❌ | ✅ |

## Rotas não impactadas (já corretas)

| Rota | Motivo |
|------|--------|
| `/inbox` | Já usava `h-full min-h-0` com scroll interno por coluna |
| `/inbox/$conversationId` | idem |
| `/flows/$flowId` | Canvas React Flow fullscreen (autocontido) |
| `/agents/$agentId` | Studio com scroll interno |
| `/auth` | Página pública com scroll natural de body |
| `/invite/$token` | idem |
| `404` | idem |

## Fix adicional

**Arquivo**: `src/styles.css`
**Correção**: `body { pointer-events: auto !important }` — safeguard contra Radix deixar `pointer-events: none` preso no body em race conditions de fechamento rápido de Dialog/Sheet/Drawer.

## Impacto Mobile

**Zero mudança** — `MobileShell` mantém `main overflow-hidden` e cada tela mobile já possui seu próprio scroll container (`mobile-*-home.tsx` com `overflow-y-auto` interno). Alterar duplicaria scroll. Testes visuais RC2 confirmam scroll natural funcional em 390/414/768.
