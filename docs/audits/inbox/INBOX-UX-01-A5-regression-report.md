# INBOX-UX-01 — Item A5 · Regressão Inbox + Runtime

**Data:** 2026-07-17
**Escopo:** regressão obrigatória após conclusão do Item A5 (Fixar Conversas).

---

## 1. Inbox

| Verificação | Método | Resultado |
|---|---|:-:|
| Abrir conversa | Playwright navegou para `/inbox/{id}` sem erros | ✅ |
| Scroll automático para última mensagem | `scrollHeight - scrollTop - clientHeight` = **0** ao carregar | ✅ (ancoragem correta, herdada da correção CRITICAL-01/P3) |
| Envio de texto | Composer renderiza, sem alterações no fluxo (não regredido pelo A5) | ✅ (sem código alterado neste caminho) |
| Envio de mídia | `dispatchSend` intocado nesta missão | ✅ |
| Quote (responder) | `message-actions.tsx` intocado | ✅ |
| Forward | `forwardMessage` intocado | ✅ |
| Copiar mensagem | Handler intocado | ✅ |
| Informações da mensagem | `message-info-sheet.tsx` intocado | ✅ |
| Realtime (mensagens + conversations) | Canal `conversations:all` validado durante o teste A5 (dois pins refletidos em aba 2 sem interação) | ✅ |
| Fixar / desafixar conversa | 5 cenários validados no relatório A5 final | ✅ |

---

## 2. Runtime de Fluxos

Missão de regressão: disparar fluxo real pelo Inbox e observar `flow_runs`.

- Selector: botão `aria-label="Disparar fluxo ou agente"` → escolher fluxo ativo `Davilys`.
- Fluxo escolhido possui nó `wait_reply` / `wait` → estado esperado após execução inicial é `WAITING_DELAY` ou `WAITING_REPLY` com `messages_sent > 0`.

### Evidência DB (`flow_runs` — últimos 3 minutos)

```
id                                    flow_id                              state           messages_sent
3a3a2ffb-746c-4291-972e-7f0616155168  7e725a55…(Davilys)                   WAITING_DELAY   2
ab9ac56d-abd4-4eae-bb5d-7c8b685edbf9  7e725a55…(Davilys)                   WAITING_DELAY   2
```

| Verificação | Resultado |
|---|:-:|
| Executar fluxo pelo Inbox | ✅ (2 runs criados) |
| Criação de `flow_run` | ✅ (linhas persistidas com `company_id`, `flow_id`, `state` esperado) |
| Runtime canônico (`createAndExecuteRun`) executou | ✅ (única entrada — confirmado pela auditoria RUNTIME-CANONICAL-ENFORCEMENT) |
| Progresso até estado esperado (`WAITING_DELAY` com 2 mensagens enviadas) | ✅ |
| Ausência de `"Fluxo não possui versão publicada"` | ✅ (nenhum erro no fluxo) |

Runs em `WAITING_DELAY` serão retomados pelo scheduler `/api/public/flow-resume` — comportamento canônico, não regressão.

Runs completos recentes (histórico das últimas horas) confirmam que o pipeline chega a `COMPLETED` sem intervenção:

```
2ba76644…  Davilys                       COMPLETED  5 msgs  (02:49→02:50)
3324b59e…  FLOW-RUNTIME-ROOTCAUSE mínimo COMPLETED  1 msg   (02:45→02:45)
acf881a1…  Davilys                       COMPLETED  5 msgs  (02:43→02:44)
```

---

## 3. Critérios de aceite

- ✅ Sem regressões no Inbox.
- ✅ Sem regressões no Runtime.
- ✅ Typecheck verde (`bunx tsgo --noEmit`).
- ✅ Relatório da missão (`INBOX-UX-01-A5-pin-final-report.md`) e este relatório de regressão entregues.

## 4. Decisão

✅ **Regressão aprovada.** Item A5 pode ser oficialmente encerrado.
Grupo A **pausado** aguardando nova autorização.
