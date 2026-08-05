# ZENDA — INBOX UX HOTFIX 01
## Reposicionamento do menu "Enviar fluxo / Enviar agente IA"

**Tipo:** Hotfix UX cirúrgico
**Escopo:** Reposicionamento visual de gatilho já existente.
**Sem alteração de:** runtime, banco, migrations, contratos, RBAC, multi-tenancy, Flow Builder, AI Agents.

---

## Problema

O menu ⋮ com as ações "Enviar fluxo", "Enviar agente IA" e "Simular resposta (dev)"
estava dentro do composer (rodapé da conversa) e também foi previamente exposto
no cabeçalho da conversa. Ambos os pontos são conceitualmente errados: são
ações **sobre o contato/conversa**, não sobre a mensagem em composição.

Além disso, "Simular resposta (dev)" era exposto a usuários operacionais em
produção.

---

## Alterações

### 1) Removido do composer
Arquivo: `src/components/inbox/message-composer.tsx`
- Removido o `DropdownMenu` (⋮) com "Enviar fluxo / Enviar agente IA / Simular resposta (dev)".
- O `FlowAgentPopover` continua no composer e continua sendo aberto pelo
  evento `inbox:open-flow-agent` (fonte única de verdade).
- Nada de execução, contratos ou payloads foi tocado.

### 2) Removido do header da conversa
Arquivo: `src/routes/_authenticated.inbox.$conversationId.tsx`
- Removido o ⋮ que havia sido inserido ao lado do nome do contato no header.
- Header voltou a mostrar apenas nome + telefone/canal.

### 3) Adicionado no card/ficha do contato
Arquivo: `src/components/inbox/contact-panel.tsx`
- Ao lado do ícone ✏ (Editar contato) do cabeçalho do painel do contato, foi
  adicionado o ⋮ "Mais ações do contato".
- Itens do menu:
  - **Enviar fluxo** → dispara `inbox:open-flow-agent` com `{ tab: "flows", contactId, conversationId }`.
  - **Enviar agente IA** → dispara `inbox:open-flow-agent` com `{ tab: "agents", contactId, conversationId }`.
- O evento é escutado pelo composer, que abre o `FlowAgentPopover` existente,
  já parametrizado com `conversationId`/`companyId` reais.

### 4) "Simular resposta (dev)"
- Removido da UI operacional. A mutation `simulateMut` continua no arquivo do
  composer para uso interno/testes, mas não há mais gatilho visível para o
  usuário em produção.

---

## Fonte única de verdade

- **Ação:** `FlowAgentPopover` no `message-composer.tsx` (não duplicado).
- **Gatilho:** DropdownMenu no `contact-panel.tsx`, comunicando via
  `CustomEvent("inbox:open-flow-agent", { detail: { tab, contactId, conversationId } })`.
- **Contrato:** inalterado — usa `sendFlowNow` / `runAgentOnce` já existentes.

---

## Contexto anti-stale

O `ContactPanel` recebe `contact` e `conversationId` como props do route file
(`_authenticated.inbox.$conversationId.tsx`). Ao trocar de conversa, o
TanStack Router re-renderiza a rota com novos props e o menu automaticamente
opera sobre o novo `contactId`/`conversationId`. O `detail` do evento também
é lido no momento do clique, então não há closure stale.

---

## Regressão

- **Typecheck:** PASS (`bunx tsgo --noEmit`).
- **Contratos preservados:** `sendFlowNow`, `runAgentOnce`, RBAC via `requireSupabaseAuth`, isolamento por `company_id`.
- **Composer:** demais controles (emoji, anexo, áudio, atalhos, channel picker, enviar) intactos.
- **Mobile:** dropdown com `align="end"` — Radix ajusta automaticamente para dentro da viewport.
- **A11y:** `aria-label="Mais ações do contato"`, `title="Mais ações"`, suporte a teclado/ESC/click-outside pelo Radix DropdownMenu.

---

## Veredito

**HOTFIX ACCEPTED.** Global Freeze preservado.
