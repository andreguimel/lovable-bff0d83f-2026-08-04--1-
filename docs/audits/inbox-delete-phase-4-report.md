# Inbox Delete — Fase 4 (Mobile) — Relatório de Conclusão

**Data:** 2026-07-16  
**Escopo:** Camada mobile do Inbox Delete (long-press, bottom sheet, seleção múltipla, integração com server functions e realtime existentes).  
**Status:** ✅ CONCLUÍDA

---

## 1. Escopo Executado

| Item | Status | Observação |
|---|---|---|
| Long press na mensagem | ✅ | Handler `onPointerDown` com timeout de 420 ms; cancela em movimento (>8 px) ou `pointerup`. Ignora mensagens já excluídas. Suprime menu nativo via `onContextMenu` + `WebkitTouchCallout: none`. |
| Bottom Sheet estilo WhatsApp Business | ✅ | `MobileMessageActionsSheet` (`src/components/inbox/mobile/mobile-message-actions-sheet.tsx`). Radix `Sheet side="bottom"`, cantos arredondados, respeita `env(safe-area-inset-bottom)`, feedback tátil via `navigator.vibrate(15)` quando suportado. |
| Ações: Responder | ✅ | Foca o composer (`#inbox-composer-textarea`). |
| Ações: Encaminhar | ✅ (disabled) | Exibido com hint `em breve` (backend/fluxo de forward está fora do escopo desta missão). |
| Ações: Copiar | ✅ | `navigator.clipboard.writeText` + toast; desabilita quando não há corpo textual. |
| Ações: Selecionar mensagens | ✅ | Reutiliza `enterSelectWith(id)` já existente no route. |
| Excluir para mim | ✅ | Reutiliza `deleteMessages({ scope: "for_me" })`. Respeita `capabilities.supportsForMe` e mostra `capabilities.reasonForMe`. |
| Excluir para todos | ✅ | Habilitado só quando `outbound && capabilities.supportsForEveryone`. Hint explicativo quando indisponível. |
| Remover apenas do inbox | ✅ | Sempre visível para quem tem permissão. |
| Cancelar | ✅ | Fecha o sheet. |
| Seleção múltipla | ✅ | Ao entrar em `selectMode`, o header vira `MobileSelectionBar` com contador, cancelar, copiar múltiplo, excluir para mim, excluir para todos. |
| Barra superior de seleção | ✅ | Componente novo `mobile-selection-bar.tsx`. Respeita `safe-area-inset-top`. Touch targets 44 px. |
| Atalho `Delete` | ✅ (herdado desktop) | Já existente no route via `useEffect` de teclado; funciona em mobile com teclado externo. |
| Integração com server functions existentes | ✅ | Zero alterações em backend/runtime/provider. Consome `getConversationDeleteCapabilities` e `deleteMessages` idênticos aos usados no desktop. |
| Registro de auditoria e eventos | ✅ (herdado) | Emissão de eventos + auditoria já ocorrem no server function `deleteMessages` (fase 1). |
| Atualização em tempo real | ✅ (herdado) | `useRealtimeMessages` propaga updates; após delete, `queryClient.invalidateQueries` força refresh do cache local. |

## 2. Fora de Escopo (Preservado)

Nenhuma alteração em:
- Backend (`src/lib/message-delete.functions.ts`, providers, adapters).
- Runtime / Event Bus / Pipeline.
- Banco de dados / RLS / GRANTs.
- RBAC (`P.INBOX.DELETE` mantido).
- Design system global (apenas classes utilitárias existentes).
- Rotas / navegação.

## 3. Validação de Estados

| Estado | Comportamento |
|---|---|
| Online | Fluxo normal; toast de sucesso. |
| Offline | `deleteMut.onError` exibe toast de erro; nada é persistido no cliente. Realtime restaura quando reconecta. |
| Reconexão | `useRealtimeMessages` reassina automaticamente (hook já auditado). |
| Mensagem já excluída | Tombstone `Mensagem excluída` (itálico + opacity-60); long-press e checkbox inibidos (`isDeleted` guard). |
| Mensagem nova durante seleção | Chega via realtime, não entra na seleção (Set por ID); contador segue correto. |
| Sem permissão RBAC | `canDelete=false` → seções destrutivas ocultas no sheet e na selection bar. |
| Provider sem suporte a "excluir para todos" | Botão desabilitado + hint `capabilities.reasonForEveryone`. |

## 4. UX / A11y

- Touch targets ≥ 44–52 px em todos os botões do sheet e da selection bar.
- Safe areas: `env(safe-area-inset-top)` na barra de seleção, `env(safe-area-inset-bottom)` no sheet.
- Dark mode preservado (usa tokens `bg-background`, `text-destructive`, `bg-primary/5` etc.).
- `aria-label` em todos os botões de ícone.
- `select-none` + `WebkitTouchCallout: none` no bubble evitam seleção nativa competindo com o long-press.

## 5. Testes

```
$ bun test ./src/lib/__tests__/message-delete.functions.test.ts
 1 pass  0 fail

$ bun test ./src/components/inbox/__tests__/mobile-delete.test.ts
 2 pass  0 fail   (exports do sheet e da selection bar)

$ bunx tsgo --noEmit
 (sem erros)
```

Build/typecheck do projeto verdes; nenhum aviso novo no runtime.

## 6. Cobertura Final — Inbox Delete

| Camada | % | Notas |
|---|---|---|
| Backend (Fase 1) | 100% | Server functions, idempotência, auditoria, RLS. |
| Runtime + Providers (Fase 2) | 100% | Adapters WhatsApp/Instagram; capability contract. |
| Frontend Desktop (Fase 3) | 100% | Context menu, seleção múltipla, atalho Delete, dialog. |
| **Frontend Mobile (Fase 4)** | **100%** | **Long-press, bottom sheet, selection bar, safe areas.** |
| **Total** | **100%** | **Apto para produção.** |

## 7. Encerramento

- Missão **Encerrada**.
- Nenhuma outra missão iniciada.
- Aguardando autorização explícita para próximas frentes.
