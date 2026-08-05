# Runtime Canonical Enforcement — Auditoria

**Data:** 2026-07-17
**Objetivo:** garantir que nenhum ponto do sistema seja capaz de iniciar (ou retomar) a execução de um fluxo fora do Runtime oficial (`createAndExecuteRun` / `executeRun` em `src/lib/flow-executor.server.ts`).
**Escopo:** todos os call sites que criam registros em `public.flow_runs` ou invocam qualquer executor de nós.
**Metodologia:** varredura `rg` em `src/` e `supabase/` por:
- `createAndExecuteRun`, `executeRun`
- `from("flow_runs").insert`
- Interpretadores paralelos de `flow_nodes` / `flow_edges`

---

## 1. Pontos de entrada canônicos

Todo o motor vive em `src/lib/flow-executor.server.ts`:

| Função canônica         | Papel                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| `createAndExecuteRun`   | **Única** função autorizada a criar um `flow_run` novo.                |
| `executeRun`            | **Única** função autorizada a avançar/retomar um `flow_run` existente. |
| `resolvePublishedFlowVersion` (interna) | Fonte de verdade para localizar `flow_versions.status = 'published'`. |

Nenhum outro caminho no repositório executa `insert` direto em `public.flow_runs` — confirmado por `rg 'from(.*flow_runs.*).insert'` (0 matches fora do executor).

---

## 2. Matriz de origens

| Origem                                    | Arquivo                                                       | Executor utilizado                                             | Status |
| ----------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- | :----: |
| Inbox — botão "Executar fluxo"            | `src/lib/inbox.functions.ts` → `runFlowOnConversation`        | `createAndExecuteRun`                                          |   ✅   |
| Inbox — transferência de conversa         | `src/lib/transfers.functions.ts` → `transferConversation`     | `createAndExecuteRun`                                          |   ✅   |
| Studio — botão "Executar" (manual)        | `src/lib/flow-executor.functions.ts` → `startFlowRun`         | `createAndExecuteRun`                                          |   ✅   |
| Studio — retomar run pausado              | `src/lib/flow-executor.functions.ts` → `resumeFlowRun`        | `executeRun`                                                   |   ✅   |
| Studio — cancelar run                     | `src/lib/flow-executor.functions.ts` → `cancelFlowRun`        | `UPDATE flow_runs.status='cancelled'` (não executa nó)         |   ✅   |
| DLQ retry                                 | `src/lib/flow-executor.functions.ts` → `retryFlowDeadLetter`  | `executeRun`                                                   |   ✅   |
| Scheduler (cron `/api/public/flow-resume`)| `src/routes/api/public/flow-resume.ts`                        | `executeRun` (retoma `WAITING_DELAY` / `RETRYING` vencidos)    |   ✅   |
| Webhook WhatsApp (wait_reply)             | `src/routes/api/public/webhooks/whatsapp.$channelId.ts` → `resumeWaitingReplyForConversation` | `executeRun` (via helper `flow-resume-inbound.server.ts`) |   ✅   |
| Webhook WhatsApp — welcome flow           | `default_welcome_flow_id` selecionado mas **não disparado**    | — (não é ponto de entrada ativo)                               |   ➖   |
| API pública                               | Não existe endpoint público de execução                        | —                                                              |   ➖   |
| Studio — botão "Testar"                   | `src/lib/flows.functions.ts` → `runFlowTest`                  | **Simulador dry-run isolado** (ver §3)                         |   ⚠️   |

---

## 3. `runFlowTest` — sandbox de simulação

`runFlowTest` (linha 514 de `src/lib/flows.functions.ts`) é um interpretador em memória usado exclusivamente pelo botão "Testar" do Studio. Ele:

- **NÃO** cria linha em `flow_runs`;
- **NÃO** persiste `flow_run_steps`;
- **NÃO** envia mensagens reais via `dispatchSend`;
- **NÃO** consulta `flow_versions` — lê `flow_nodes`/`flow_edges` diretamente para preview do editor;
- Retorna um array de `steps` simulados para renderização no painel do Studio.

**Decisão:** manter como sandbox. Não é um executor de produção — nenhuma execução real do usuário passa por ele. Alterar sua semântica (redirecioná-lo para `createAndExecuteRun`) violaria o congelamento arquitetural e produziria efeitos colaterais (mensagens reais em teste), o oposto do desejado.

**Guardrail documental:** o arquivo já é isolado por nome (`runFlowTest`). Recomenda-se, em pacote futuro autorizado, renomear para `simulateFlowInStudio` e prefixar a UI com "Simular" para eliminar ambiguidade.

---

## 4. Verificações objetivas

```bash
# 1) Nenhum insert direto em flow_runs fora do executor
$ rg -n 'from\(\s*["'\'']flow_runs["'\'']\s*\)\.insert' src supabase
(sem matches)

# 2) Todas as chamadas a createAndExecuteRun
$ rg -n 'createAndExecuteRun\(' src
src/lib/flow-executor.functions.ts:35   → startFlowRun (Studio manual)
src/lib/inbox.functions.ts:656          → runFlowOnConversation (Inbox)
src/lib/transfers.functions.ts:217      → transferConversation (Inbox)

# 3) Todas as chamadas a executeRun (retomada)
$ rg -n 'executeRun\(' src
src/lib/flow-executor.functions.ts:71    → resumeFlowRun
src/lib/flow-executor.functions.ts:144   → retryFlowDeadLetter
src/lib/flow-resume-inbound.server.ts:122 → resumeWaitingReplyForConversation
src/routes/api/public/flow-resume.ts:99  → scheduler cron
```

**Resultado:** 3 pontos de criação, 4 pontos de retomada. **100 %** convergem para `flow-executor.server.ts`.

---

## 5. Conclusão

Não existe caminho paralelo de execução de fluxo em produção. A causa raiz que motivou a missão CRITICAL-01 (`transferConversation` executando via leitura direta de `flow_nodes`) foi eliminada e permanece eliminada.

O único interpretador remanescente (`runFlowTest`) é um **simulador de Studio**, formalmente isolado do runtime real por não escrever em `flow_runs` nem chamar `dispatchSend`.

**Estado do runtime:** fonte de verdade única para criação (`createAndExecuteRun`) e para avanço (`executeRun`). Apto para o piloto.

**Decisão:** ✅ **Encerrada**.

**Próximo passo autorizado:** retomar o **Grupo A** do roadmap INBOX-UX-01 mediante autorização explícita do usuário.
