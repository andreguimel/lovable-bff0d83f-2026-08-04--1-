# Gate — Runtime Validation (Pós Runtime-02.2)

**Modo:** Validação híbrida documentada (aprovado pelo usuário).
**Data original:** 2026-07-16 17:45 UTC.
**Reexecução 1:** 2026-07-16 18:07 UTC (pós Runtime-02.3).
**Reexecução 2:** 2026-07-16 18:26 UTC (pós Runtime-02.3.1 — cron reagendado).
**Escopo:** Verificar comportamento ponta a ponta do Runtime em ambiente real.
**Status:** ✅ **APROVADO em produção** — F-VAL-01 fechado (código + operação). Scheduler recebe 200 do worker publicado a cada 60s. Backlog = 0. WAITING_REPLY = 0.

> Reexecução 2 (18:26 UTC): o pg_cron enviava `apikey` mas o worker publicado ainda serve a versão antiga do endpoint (aceita apenas `x-scheduler-secret`). Corrigido operacionalmente: `cron.job.flow-scheduler-tick` reagendado para enviar `x-scheduler-secret: <FLOW_SCHEDULER_SECRET>`. `net._http_response` passou de 401-em-cadeia (18:15→18:24) para 200 consistente (18:25, 18:26). Nenhum código alterado. Ver `runtime-02.3-scheduler-recovery-report.md` §Addendum Runtime-02.3.1.




Executada validação híbrida conforme autorização:

- **Real:** query direta ao banco de produção (`flow_runs`, `flow_run_steps`, `messages`, `conversations`, `channels`), invocação dos endpoints publicados (`https://talkebase.lovable.app/api/public/*`), suíte de testes contra o executor real (`vitest` + `bun test`).
- **Simulado documentado:** cenários que dependem de infra externa real (ACK Meta, provider indisponível real, cliente humano) são apresentados como *não verificáveis no sandbox* + runbook para execução em staging.

Ambiente sob teste:
- `channels`: **2 canais, ambos `provider=mock`** (não há canal WhatsApp Cloud/Evolution ativo neste tenant). Consequência: ACKs, `provider_message_id` reais e webhook inbound real (`x-hub-signature-256`) **não são exercíveis** aqui — só via runbook em staging com número Business ativo.
- Tenant: `1a78ceb5-c9cc-4d8f-af6c-d6a7195a6f13`, único flow publicado (`Davilys`).

---

## 2. Achado Crítico Descoberto Durante o Gate

### 🔴 F-VAL-01 — Scheduler de `WAITING_DELAY` não está sendo invocado em produção (P0)

**Evidência direta:**

```
 count 
-------
     3       ← runs em WAITING_DELAY com resume_at < now()
```

```
 id                                   | resume_at                  | overdue
--------------------------------------+----------------------------+------------------
 6a6ccd03-565e-47c1-9fd8-2660ae8e0f02 | 2026-07-15 21:25:24.098+00 | 20:19:51
 5abb9665-68af-479e-b1f9-76a32a69d587 | 2026-07-15 21:41:44.874+00 | 20:03:30
 75ad31d9-c6c5-4b4d-9322-ad6080cc447a | 2026-07-15 21:51:35.607+00 | 19:53:39
```

**Trilha em `flow_run_steps` (todas as 3 runs):** `start → message → send_audio → wait` — todos `state=ok`. A transição para `WAITING_DELAY` gravou `resume_at` a **~10–15 segundos** no futuro, mas passaram **~20 horas** sem retomada.

**Causa raiz:**
- O único mecanismo de retomada de `WAITING_DELAY` é `POST /api/public/flow-resume` (arquivo `src/routes/api/public/flow-resume.ts`), protegido por `FLOW_SCHEDULER_SECRET`.
- **`FLOW_SCHEDULER_SECRET` não está configurado** nos secrets do projeto (verificado via `secrets--fetch_secrets`: apenas `LOVABLE_API_KEY`).
- Chamadas ao endpoint retornam `401 Unauthorized` (com e sem header) — confirmado via `curl` ao domínio publicado.
- Não há `pg_cron` job ativo em `cron.job` disparando essa rota; o schema `cron` está inacessível ao role da API, indicando que nenhuma configuração de scheduler foi feita.

**Impacto:**
- **Nenhum fluxo com bloco `wait` (delay) completa em produção.**
- Simétrico ao F-ADD-01 (resolvido em Runtime-02.2 para `WAITING_REPLY`): agora `WAITING_DELAY` está no mesmo estado — a lógica de execução funciona, mas ninguém a dispara.
- Toda run que passar por um `wait` fica presa indefinidamente. As 3 runs em produção comprovam o comportamento.

**Classificação:** 🔴 **Crítico (P0)**.

**Regra de correção:** Nenhuma neste Gate. Registrado apenas.

---

## 3. Cenários Requisitados vs. Executados

| # | Cenário | Executado | Resultado | Evidência |
|---|--------|-----------|-----------|-----------|
| 1 | Fluxo básico (start→msg→wait_reply→resp→end) | Parcial — via testes | Executor real do resume funciona (6/6 vitest); ponta a ponta bloqueado por F-VAL-01 (wait não retoma) | `flow-resume-inbound.test.ts` (6 pass) |
| 2 | Qualificação (nome/email/CNPJ + IA + CRM + tag + transfer) | Não executado | Requer canal WhatsApp real + cliente humano; runbook §6 | — |
| 3 | Mídias (msg/audio/image/doc/video, ACK, provider_message_id) | Parcial | Steps `send_audio` executam com `state=ok` no mock; `provider_message_id=NULL` em todas as mensagens outbound (esperado para mock, **não verificável** aqui para Cloud API) | Steps das 3 runs presas |
| 4 | Fluxo IA (prompt/vars/reply/histórico) | Não executado | Requer flow com nó AI e canal real; F-ADD-04 (histórico ausente) permanece em backlog | Backlog `F-ADD-04` |
| 5 | Condition (TRUE/FALSE/múltiplas) | Não executado | Nenhum flow publicado usa `condition`; F-SYNTH-01 permanece em backlog | Backlog `F-SYNTH-01` |
| 6 | Wait (DELAY, REPLY, combinações) | Executado — **BLOQUEADO** | `WAITING_DELAY` não retoma em prod (**F-VAL-01**); `WAITING_REPLY` corrigido em Runtime-02.2 mas não exercitável ponta a ponta aqui (sem webhook Meta assinado) | §2 acima |
| 7 | Erro (provider down / webhook 500 / timeout IA / retry) | Não executado | Sandbox não tem como derrubar provider real; runbook §6 | — |
| 8 | Concorrência (20 conv × 10 flows) | Não executado | Requer tráfego real e provider real; runbook §6 | — |
| 9 | Inbox (preview/last_message/last_message_at/unread) | Parcial | Conversas das runs presas mostram `last_message_at` atualizado, `unread_count=0` — sincronização básica ok; F-ADD-03 (last_message_at por outbound) permanece em backlog | Query §4 |
| 10 | Persistência (flow_runs/steps/messages/conversations/events) | Executado | Consistência estrutural íntegra; sem órfãos; steps completos e ordenados | §4 |

---

## 4. Evidências de Persistência

```
flow_runs por status
  waiting   : 5   (3 travadas em WAITING_DELAY + 2 zumbis em CREATED sem resume_at)
  completed : 9

flow_run_steps por state
  ok : 18   (nenhum step em erro)

messages recentes: 8 outbound, todas sent, provider_message_id=NULL (mock)
Inbox: last_message_at reflete o outbound mais recente por conversa; unread_count=0
```

**Zumbis em `CREATED`:** 2 runs (`be63d9fc…`, `4302a058…`) permanecem em `status=waiting, state=CREATED` desde 2026-07-15 16:43, sem `conversation_id`, sem `resume_at`, sem step algum registrado. Origem provável: chamadas a `createRun` sem seguir `startRun`, ou falha silenciosa no dispatch inicial. **Não pertencem ao escopo deste Gate** — registrado como `F-VAL-02` (Médio) no backlog para investigação futura.

---

## 5. Suíte de Testes Automatizados

Rodada durante o Gate (executor real, sem mocks de rede):

- `bun test src/lib/wa-providers/__tests__/` e `src/lib/enrichment/__tests__/` → **56 pass / 0 fail** (177 asserts).
- `vitest run src/lib/__tests__/flow-resume-inbound.test.ts` → **6 pass / 0 fail** (validação do hand-off atômico WAITING_REPLY→RUNNING, dedupe por `provider_message_id`, concorrência, escopo por conversa, tratamento de falha do executor).

Nota: os 5 arquivos que usam `bun:test` só rodam sob `bun test`, não sob `vitest`. Não é regressão — é convenção do projeto.

---

## 6. Runbook para o QA humano (staging com número WhatsApp real)

Os cenários 2, 4, 5, 7, 8 e a validação real de ACK/`provider_message_id` do cenário 3 exigem infra que este sandbox não possui. Roteiro para execução em staging:

1. Provisionar um canal `whatsapp` (Cloud API) real: preencher `credentials.access_token`, `credentials.app_secret`, `phone_number_id`, `webhook_verify_token`; conectar webhook Meta em `https://project--<id>.lovable.app/api/public/webhooks/whatsapp/<channelId>`.
2. Configurar `FLOW_SCHEDULER_SECRET` como secret do projeto **e** criar cron externo (ou pg_cron) postando a cada 60s em `/api/public/flow-resume` com `x-scheduler-secret: <valor>`. **Sem isso, cenário 6 continua bloqueado (F-VAL-01).**
3. Publicar 5 flows sintéticos cobrindo os cenários 1–6. Enviar mensagem inicial a partir do WhatsApp do QA; validar cada transição consultando `flow_runs.state` e `flow_run_steps`.
4. Cenário 7: revogar temporariamente o `access_token` no Meta Business (provider indisponível) e reintroduzir; validar retry classificado como transient.
5. Cenário 8: script k6 disparando 20 conversas paralelas × 10 flows por 5 min; validar que nenhum step duplica em `(run_id, seq)` e que a lock (`lock_token`) impede execução concorrente.
6. Cenário 9: abrir a Inbox no preview logado (Playwright) e verificar `last_message`, `last_message_at`, `unread_count` para cada conversa afetada.

---

## 7. Parecer Técnico (reavaliado pós Runtime-02.3)

| Dimensão | Nota original | Nota atual |
|---|---|---|
| Integridade de persistência | 9/10 | 9/10 |
| Confiabilidade do executor (por step) | 8/10 | 8/10 |
| Confiabilidade ponta a ponta | 4/10 | **8/10** (scheduler operacional) |
| Sincronização com Inbox | 7/10 | 7/10 |
| Cobertura de testes | 7/10 | 7/10 |
| Observabilidade do Scheduler | — | 8/10 (heartbeats + health probe) |
| **Nota final do Runtime** | 6.8/10 | **8.0/10** |

**Runtime aprovado para produção com fluxos que contêm `wait`.** Cenários 2, 4, 5, 7, 8 continuam dependendo de infra externa real (número WhatsApp Business ativo) — runbook §6 permanece válido para o QA humano.

---

## 8. Findings gerados neste Gate

| ID | Severidade | Título | Ação |
|---|---|---|---|
| F-VAL-01 | 🔴 P0 | Scheduler `WAITING_DELAY` não é invocado em produção | ✅ **RESOLVIDO em Runtime-02.3** |
| F-VAL-02 | 🟡 Médio | 2 runs zumbis em `state=CREATED` sem `resume_at` nem steps | Backlog para investigação |

---

## 9. Status Final

- **Encerramento do Gate:** ✅ **APROVADO** pós Runtime-02.3.
- **Ação recomendada:** aguardar autorização explícita do usuário antes de qualquer nova sub-missão.

