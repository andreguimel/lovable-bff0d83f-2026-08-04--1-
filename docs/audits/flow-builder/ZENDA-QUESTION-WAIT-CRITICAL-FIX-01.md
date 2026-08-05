# ZENDA-QUESTION-WAIT-CRITICAL-FIX-01

**Missão:** corrigir o bloco “Fazer uma pergunta” para pausar obrigatoriamente até resposta ou expiração.
**Escopo:** defeito crítico isolado no Runtime Engine; sem alteração arquitetural.

## Evidência de causa

Run real auditado: `45c9b715-160f-4f03-84f5-0e335a24bcef`.

- versão publicada 2 continha `question` com timeout de 5 minutos;
- o step da pergunta retornou somente `{ sent: "qual seu cnpj ?" }`;
- não houve evento `FlowPaused` após a pergunta;
- os nós seguintes foram executados imediatamente no mesmo run.

O ambiente publicado estava executando o comportamento legado de mensagem simples, apesar do contrato canônico atual prever `WAITING_REPLY`.

## Correção

- o plugin canônico `questionNode` identifica explicitamente a pausa em seu output;
- primeira passagem envia uma única vez e retorna `WAITING_REPLY` com `resume_at`;
- resposta retoma pelo handle `default` e persiste a variável configurada;
- expiração retoma pelo handle `no_reply`;
- uma saída escolhida porém desconectada agora falha explicitamente, sem fallback silencioso para outra aresta.

## Regressão

Arquivos:

- `src/lib/__tests__/flow-executor-question.test.ts` — contrato do plugin;
- `src/lib/__tests__/flow-executor-linear-run.test.ts` — pausa e retomada pelo loop real de `executeRun`;
- `src/lib/__tests__/flow-resume-inbound.test.ts` — entrega inbound, idempotência e concorrência.

Cenários:

1. envio único + pausa obrigatória;
2. resposta + caminho `default` sem reenvio;
3. timeout + caminho `no_reply` sem reenvio;
4. conversão de segundos, minutos, horas e dias.
5. `executeRun` persiste `WAITING_REPLY`, mantém o cursor na pergunta e não visita o próximo nó antes da resposta;
6. resposta retoma no mesmo nó e conclui somente o caminho `default`.

Resultado focado:

```text
17 pass
0 fail
78 assertions
```

## Decisão

**Status da missão:** ✅ **Encerrada** — causa confirmada em run real, correção aplicada e regressão do caminho completo aprovada.