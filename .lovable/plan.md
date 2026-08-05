## Diagnóstico confirmado

No run real `45c9b715-160f-4f03-84f5-0e335a24bcef`, a versão publicada contém a pergunta com `timeout_value: 5` e `timeout_unit: minutes`, além das saídas `default` e `no_reply`. Mesmo assim, às `00:30:06` o step da pergunta retornou apenas `{ sent: "qual seu cnpj ?" }`, não emitiu `FlowPaused` e o executor iniciou imediatamente os nós seguintes. Portanto, o runtime efetivamente usado tratou a pergunta como envio comum.

O código atual já descreve a regra correta em `questionNode`, mas falta uma regressão end-to-end que garanta que essa implementação seja a executada e que a versão corrigida esteja no ambiente que recebe os webhooks e roda o scheduler.

## Implementação urgente

1. **Blindar o executor da pergunta**
   - Garantir que `question` esteja ligado exclusivamente ao `questionNode` canônico.
   - Na primeira passagem: enviar a pergunta uma única vez, persistir `__question`, `resume_at` e estado `WAITING_REPLY`, mantendo o cursor no próprio nó.
   - Impedir avanço para qualquer saída nessa primeira passagem.

2. **Corrigir as duas retomadas**
   - Resposta recebida antes do prazo: preencher `last_reply` e a variável configurada em `save_as`, limpar a espera e seguir somente pela saída `default` (“após resposta”).
   - Prazo vencido sem resposta: retomar somente após `resume_at` e seguir pela saída `no_reply` (“se não responder”).
   - Preservar espera indefinida quando o tempo estiver vazio.

3. **Eliminar avanço silencioso incorreto**
   - Para o bloco de pergunta, não permitir fallback para a primeira aresta quando a saída escolhida (`default` ou `no_reply`) não existir; registrar falha explícita em vez de executar um caminho errado.

4. **Adicionar regressão no caminho real**
   - Testar o `executeRun` completo: primeira passagem envia e pausa sem visitar o próximo nó.
   - Testar resposta inbound: retoma no mesmo nó e visita apenas o caminho `default`.
   - Testar timeout: não avança antes do prazo e visita apenas `no_reply` depois do prazo.
   - Cobrir conversão de segundos, minutos, horas e dias.
   - Confirmar que a pergunta não é reenviada na retomada.

5. **Validar e liberar**
   - Rodar os testes focados do executor e da retomada inbound.
   - Validar o build e conferir um run controlado com eventos `FlowPaused` → `FlowReplyReceived`/timeout → continuação correta.
   - Publicar a versão corrigida para que webhooks e scheduler usem o mesmo runtime validado.
   - Registrar relatório de conclusão com evidências e decisão explícita **Encerrada** ou **Bloqueada**, sem refatoração fora deste defeito crítico.