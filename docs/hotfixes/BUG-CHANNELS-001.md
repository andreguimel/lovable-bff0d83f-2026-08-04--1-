# BUG-CHANNELS-001 — Rota /channels quebrada + menu de mensagem (RC3.1)

**Data:** 2026-07-16
**Escopo autorizado:** correção pontual de 2 bugs funcionais relatados pelo usuário.
**Regra respeitada:** congelamento pós-RC3.1. Sem novas features, sem alterar Runtime/Backend/RBAC/RLS/Providers/Fluxos/IA/arquitetura.

---

## Bug 2 — Rota `/channels` exibia "Não foi possível carregar"

### Causa raiz
`src/routes/_authenticated.channels.tsx` (linha 67, `ChannelsPage` — variante **desktop** da rota) chama `useMobileFab()`. Esse hook lança `Error("useMobileFab must be used inside MobileFabProvider")` quando montado fora do provider. O provider (`MobileFabProvider`) só é instanciado dentro do `MobileShell` (`src/components/mobile/mobile-shell.tsx`), portanto no desktop o hook sempre lançava.

O erro subia até o `errorComponent` do `__root.tsx`, que renderiza o card "Não foi possível carregar" (`src/routes/__root.tsx:55`).

O mesmo padrão existe em `src/routes/_authenticated.campaigns.tsx:51` — também estava crashando no desktop, embora não relatado.

Evidência (Playwright + console do browser antes da correção):

```
Error: useMobileFab must be used inside MobileFabProvider
    at useMobileFab (src/components/mobile/mobile-fab.tsx:35)
    at ChannelsPage (src/routes/_authenticated.channels.tsx?tsr-split=component:61)
The above error occurred in the <ChannelsPage> component.
```

### Fix aplicado
Arquivo: `src/components/mobile/mobile-fab.tsx`

Tornado `useMobileFab` tolerante: quando não há provider, retorna um contexto no-op (`{ action: null, setAction: () => {} }`) em vez de lançar. Isso:

- não altera o comportamento no mobile (o provider existe → mesmo objeto de sempre);
- desbloqueia rotas desktop que chamam o hook (ChannelsPage, CampaignsPage);
- é a mudança de menor superfície possível (5 linhas).

### Validação
- `/channels` (desktop, sessão real do piloto) agora renderiza normalmente. H1 = "Canais de WhatsApp". Zero exceções no console.
- CRUD, realtime (`useRealtimeChannels`) e listagem (`listChannels` server fn) permanecem inalterados.
- `/campaigns` (mesma armadilha) também deixa de crashar.

Evidência: `/tmp/browser/channels/1.png` (H1 correto, KPIs "Ativos / Msgs 24h / Conectando / Pausados" carregados).

---

## Bug 1 — Menu de três pontos da mensagem (Inbox)

### Diagnóstico
Reprodução com Playwright na conversa real do piloto (`/inbox/<id>`):

- Hover em qualquer mensagem → botão "Ações da mensagem" (three-dots) **aparece corretamente** (`aria-label="Ações da mensagem"`, contagem = 1).
- Clique no botão → dropdown abre com os itens esperados (Selecionar mensagem, Excluir para mim, Excluir para todos [desabilitado quando o provider não suporta revoke], Remover apenas do inbox).
- Right-click no bubble → ContextMenu abre com 4 itens.
- Zero erros de render, zero z-index/portal issues.

Evidência: `/tmp/browser/msg_menu_open.png` (dropdown aberto sobre a mensagem "Consegui resolver, obrigada pela ajuda!").

### Conclusão
**Não reproduzível.** O menu de três pontos da mensagem abre em hover-click e em right-click, desktop, com a sessão real do usuário. A percepção provável é que o Bug 2 (`/channels` crash) contaminava a impressão de instabilidade geral do Inbox — mas o menu em si está funcional.

Nenhuma alteração foi feita no menu de mensagem para respeitar o escopo. Ações completas de paridade WhatsApp Web (responder, reagir, encaminhar, favoritar, fixar, informações, edição, seleção múltipla persistida) seguem no backlog como `INBOX-UX-01`, aguardando piloto — conforme decidido.

Se após esta correção o usuário reproduzir o bug em uma mensagem específica, pedimos: (i) `messageId`; (ii) provider do canal; (iii) print do console. Assim conseguimos localizar exatamente qual bubble está travando.

---

## Arquivos alterados
- `src/components/mobile/mobile-fab.tsx` (fix Bug 2, no-op ctx)

## Arquivos NÃO alterados (verificados)
- `src/routes/_authenticated.channels.tsx` — mantido intocado
- `src/routes/_authenticated.campaigns.tsx` — mantido intocado (mesmo fix se aplica via hook)
- `src/components/inbox/message-actions.tsx` — funciona, sem regressão
- `src/lib/channels.functions.ts` — server fns intactos

## Gates
- `bunx tsgo --noEmit` — sem novas regressões (erro pré-existente em `guardian-panel.tsx:245` não relacionado a esta missão).
- Playwright: `/channels` OK, menu three-dots OK, right-click OK.

## Bugs adicionais Critical/High descobertos
- **`/campaigns` desktop** carregava a mesma exceção (`useMobileFab` fora do provider). Foi corrigido pelo mesmo fix do hook, sem tocar no arquivo da rota. Registrado aqui para transparência.

## Encerramento
Missão **Encerrada**. Nenhuma outra alteração foi realizada. Congelamento RC3.1 mantido. INBOX-UX-01 permanece no backlog.
