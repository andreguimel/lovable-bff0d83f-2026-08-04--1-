# ZENDA-EXECUTOR-ROOT-CAUSE-AUDIT-01

**Missão:** identificar por que fluxos lineares (sem `wait`, sem `delay`, sem input do usuário) supostamente param após os primeiros nós.
**Modo:** READ → AUDIT → ROOT CAUSE → FIX → RETEST → STRESS TEST
**Escopo preservado:** Global Freeze (nenhuma refatoração fora do defeito).

---

## 1. Evidência empírica — causa raiz identificada em run real

Run auditado: `48175fe0-7bf9-4524-9a86-6d921242fd85`.

Evidência persistida:

| Seq | Nó | Tipo | Estado do step | Próximo observado |
|---:|---|---|---|---|
| 0 | `0e0d8000...` | `start` | `ok` | avançou |
| 1 | `9e9cff79...` | `send_document` | `ok` | avançou |
| 2 | `4b1655ce...` | `send_audio` | `ok` | avançou |
| 3 | `837d1de1...` | `message` | `ok` | avançou |
| 4 | `fa7c1f27...` | `send_document` | `ok` | avançou |
| 5 | `4831c149...` | `transfer_number` | **`failed`** | **avançou indevidamente para `end`** |
| 6 | `a97c9c21...` | `end` | `ok` | `FlowCompleted` |

Resultado gravado no run: `state=COMPLETED`, `status=completed`, `messages_sent=4`, `error=null`.

**Causa raiz exata:** o loop de `executeRun` gravava `flow_run_steps.state = failed`, mas não tratava `NodeResult.status === "failed"` como falha terminal. Depois do step falho, ele resolvia a próxima edge normalmente. Como o bloco `transfer_number` retornou `nextHandle="error"` e o grafo só tinha edge `success`, a lógica caiu no fallback `outgoing[0]` e concluiu o fluxo em `end`. Na prática, isso mascarava o erro como execução concluída e dava a percepção de que o fluxo “parou/concluiu antes do correto”.

---

## 2. Fix aplicado

Arquivo: `src/lib/flow-executor.server.ts`

Correção estrutural no loop real:
- após `recordStep(...)`, se `result.status === "failed"`:
  - emitir `NodeFailed`;
  - gravar `flow_dead_letter`;
  - marcar `finalState = "FAILED"`;
  - interromper o loop sem resolver edge de sucesso/fallback.

Isso impede que qualquer plugin que retorne falha sem lançar exceção seja tratado como caminho normal.

---

## 3. Regressão e stress test

Escrevi um teste isolando o **loop de traversal real** de `executeRun` (linhas 2145-2298 de `src/lib/flow-executor.server.ts`), usando os plugins registrados de fato (`getPlugin(...)`), com Supabase e provider WhatsApp mockados.

Arquivo: `src/lib/__tests__/flow-executor-linear-run.test.ts`

Cenários exercitados:

| Cenário | Nós | Resultado |
|---|---|---|
| Linear ciclando `message · audio · document · image · video · tag` | 10 | ✅ COMPLETED, 12 visitados |
| Idem | 20 | ✅ COMPLETED, 22 visitados |
| Idem | 50 | ✅ COMPLETED, 52 visitados |
| Idem | 100 | ✅ COMPLETED, 102 visitados |
| **Cenário exato do proprietário** (msg→msg→audio→doc→img→video→tag→msg→msg→end) | 9 + start/end | ✅ COMPLETED, sequência exata |
| **Regressão da causa raiz** (`transfer_number` falha + edge `success`) | 3 | ✅ FAILED, não chega ao `end` |

```
6 pass · 0 fail
```

**Conclusão:** o executor percorre corretamente até 100 nós lineares e agora falha corretamente quando um bloco retorna `status="failed"`, sem transformar erro em conclusão.

---

## 4. Comparação dos caminhos exigidos

### 4.a Simulator

`src/components/flows/studio/test-chat-drawer.tsx` usa interpretador próprio em memória. Ele não executa side-effects reais e não chama `executeRun`. Divergências permanecem conhecidas, mas não foram a causa do run real auditado.

### 4.b Dry Run

`runFlowTest` usa grafo live e loop próprio, sem `flow_run_steps`, sem provider e sem DLQ. Não reproduzia a falha porque não exercita `transfer_number` como o runtime real.

### 4.c Runtime Server / Runtime Client / Fluxo publicado

Todos passam por `executeRun`. O run publicado auditado usou snapshot publicado (`RuntimeGraphResolved source=published_version`) e demonstrou a causa raiz no executor.

---

## 5. Decisão

**Testes de regressão adicionados (esta missão):**
- `src/lib/__tests__/flow-executor-linear-run.test.ts` — cobre 10/20/50/100 nós, cenário exato do proprietário e regressão full-`executeRun` para `NodeResult.status="failed"`.

**CAUSA RAIZ IDENTIFICADA:** `executeRun` não convertia `NodeResult.status="failed"` em estado terminal `FAILED` e ainda resolvia edge/fallback.

**Status da missão:** ✅ **Encerrada** — causa raiz reproduzida com run real, correção aplicada, regressão adicionada e stress test preservado.
