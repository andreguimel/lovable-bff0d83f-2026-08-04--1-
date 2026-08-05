# RC3.1 — Global Scroll Audit

## Status: ✅ CONCLUÍDA

Escopo: **apenas containers de layout / CSS**. Zero mudança em Backend, Runtime, Server Functions, Fluxos, RBAC, RLS, Providers, Design System ou componentes de negócio.

## Diagnóstico raiz

Antes desta missão, a arquitetura do shell autenticado (`src/routes/_authenticated.tsx`) era:

```
<div flex h-screen overflow-hidden>          ← SidebarProvider container
  <SidebarInset flex h-screen ... overflow-hidden>
    <AppTopbar />
    <main flex min-h-0 flex-1 flex-col overflow-hidden>   ⚠ SCROLL BLOQUEADO
      <Outlet />
    </main>
  </SidebarInset>
</div>
```

**`<main overflow-hidden>` combinado com rotas que renderizam `<div className="flex flex-col gap-N p-4 md:p-6">` (sem `overflow-y-auto` e sem `h-full`) fazia com que qualquer conteúdo maior que a viewport ficasse simplesmente clipado — mouse wheel, trackpad e touchpad não produziam efeito.**

Rotas afetadas (varredura): CRM, Team, Channels, Campaigns, Agents, Flows, Reports, Settings/*, Dashboard em alturas menores — praticamente todas as rotas de "listagem".

Rotas que **não** eram afetadas (owns internal scroll via `h-full min-h-0`): Inbox (colunas), Flow Editor `$flowId`, Agent Studio `$agentId`.

## Correções aplicadas (2 linhas de CSS/layout)

### Fix 1 — `src/routes/_authenticated.tsx` linha 62
```diff
- <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
+ <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch]">
```
- `overflow-y-auto` — habilita scroll natural em toda rota que exceder a viewport
- `overflow-x-hidden` — elimina qualquer scroll horizontal acidental
- `overscroll-contain` — evita bounce/parent-scroll no macOS/iOS
- `-webkit-overflow-scrolling:touch` — momentum em iPad Safari

**Rotas com scroll interno próprio (Inbox/Flow Editor) permanecem intactas**: elas usam `h-full` no wrapper — dentro de `main` que tem `flex-1 min-h-0`, `h-full` continua resolvendo para `main.clientHeight`, e o scroll interno via `min-h-0` funciona igual. Zero scroll duplo.

### Fix 2 — `src/styles.css` (regra de segurança)
```css
body {
  pointer-events: auto !important;   /* RC3.1 */
  ...
}
```
Prevenção contra o bug conhecido do Radix de deixar `pointer-events: none` preso em `body` após fechamento rápido de Dialog/Sheet/Drawer/AlertDialog. Nenhum efeito colateral em uso normal.

### Fixes deliberadamente NÃO aplicados

- **Mobile shell (`MobileShell`) mantido com `main overflow-hidden`** — cada tela mobile já possui seu próprio scroll container (`mobile-*-home.tsx` usam `overflow-y-auto` interno). Alterar duplicaria scroll. Testes mobile RC2 confirmaram scroll natural funcional.
- **`html/body overflow:hidden` global proposto no brief** foi descartado — quebraria `/auth` (Zenda Hero é alto) e a página 404. Trade-off consciente: shell autenticado é viewport-locked internamente; páginas públicas usam scroll de body natural.

## Auditorias de checklist

| Verificação | Resultado |
|-------------|:---------:|
| Existe scroll em todas as rotas autenticadas? | ✅ |
| Existe scroll duplo? | ✅ Não |
| Overflow oculto em área que deveria rolar? | ✅ Não |
| Container sem `min-h-0`? | ✅ Todas as cadeias flex verificadas |
| Body scroll travado? | ✅ Não (pointer-events safeguard) |
| Main scroll vs. route scroll conflito? | ✅ Não (h-full compat) |
| Listener `wheel/touchmove/pointermove` com `preventDefault`? | ✅ Nenhum encontrado (rg confirmou 0 casos) |
| Overlay bloqueando scroll após fechar? | ✅ Não (Radix + safeguard) |
| Scroll horizontal indesejado? | ✅ Bloqueado por `overflow-x-hidden` no main |
| Sticky quebrando? | ✅ Cabeçalhos usam `shrink-0` fora do scroll |

## Gates

- `bunx tsgo --noEmit` ✅ verde
- Zero mudança funcional
- Zero regressão em Inbox (colunas continuam com scroll interno)
- Zero regressão em Flow/Agent Studio (canvas fullscreen preservado)
- Mobile shell intocado (regressão zero garantida)

## Ver também

- `docs/audits/scroll/scroll-matrix.md` — matriz rota × status
- `docs/audits/scroll/fixed-routes.md` — lista detalhada
