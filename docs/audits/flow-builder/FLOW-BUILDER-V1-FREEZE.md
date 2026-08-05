# Flow Builder V1 — FREEZE

**Status oficial:** INTERNALLY PRODUCTION READY — PENDING PROVIDER ACCEPTANCE
**Data do congelamento:** 2026-07-19
**Autoridade:** decisão de produto pós Final Production Acceptance Gate.

---

## 1. Declaração de congelamento

Flow Builder V1 está **funcionalmente congelado**.

A partir desta data, o módulo não recebe novas funcionalidades, novos blocos, redesign, refactor por preferência técnica, itens Pós-V1 ou reabertura de missões encerradas sem bug comprovado.

Alterações são permitidas **exclusivamente** mediante:

- evidência reproduzível;
- classificação **Critical** ou **High**;
- missão de escopo fechado;
- correção mínima e cirúrgica;
- regressão obrigatória.

**Novas funcionalidades pertencem ao roadmap Pós-V1.**

---

## 2. Escopo entregue

### Sequência concluída

| Missão | Escopo |
|---|---|
| FB-01 | Auditoria e arquitetura |
| FB-02 | Core V2 |
| FB-03 | Canvas / Node System |
| FB-04 | SmartSidebar |
| FB-05 | Library V2 |
| FB-06 | Block Experience |
| FB-07 | Validation / Health |
| FB-08 | Stress / Performance |
| FB-09 | Acceptance inicial |
| FB-10.1 | Fundação Visual V3 |
| FB-10.2 | Library V3 |
| FB-10.3 | BlockCards V3 |
| FB-10.3.1 / 10.3.2 | Layout Hardening |
| FB-10.4A | Menu |
| FB-10.4B | Ação |
| FB-10.4C | Conexão de Fluxo |
| FB-10.4D | Randomizador |
| FB-10.4E | Auditoria de gaps |
| FB-10.5 | Condition + HTTP seguro |
| Final Production Acceptance Gate | **APROVADO INTERNAMENTE** |

### Inventário funcional final

21 kinds registrados, zero "Em breve", zero placeholders:

`start`, `end`, `message`, `question`, `menu`, `send_image`, `send_audio`, `send_video`, `send_document`, `wait`, `wait_reply`, `condition`, `ai`, `transfer`, `assign_agent`, `tag`, `http_request`, `webhook`, `action`, `flow_connection`, `randomizer`.

---

## 3. Final Production Acceptance Gate — resultado

Referência completa: [`FLOW-BUILDER-V1-FINAL-PRODUCTION-ACCEPTANCE.md`](./FLOW-BUILDER-V1-FINAL-PRODUCTION-ACCEPTANCE.md).
Sumário executivo: [`FLOW-BUILDER-V1-EXECUTIVE-SUMMARY.md`](./FLOW-BUILDER-V1-EXECUTIVE-SUMMARY.md).

### Testes

- **Typecheck** (`tsgo --noEmit`): **PASS**.
- **Regressão completa** (`bun test`): **309 / 314 PASS**.
- Falhas: 5, todas em `src/lib/observability/__tests__/guardian-alerter.test.ts`. Root cause: `vi.stubGlobal` incompatível com runner Bun. **Pré-existentes, não Flow Builder, fora do escopo do freeze.**

### High encontrado e corrigido no Gate

Security Gate SSRF (HTTP node) — 3 vetores fechados por correção pontual mínima:

1. **Redirect não revalidado** → `redirect: "manual"` + qualquer 3xx vira `failed`.
2. **Formatos alternativos de IPv4** (decimal / hex / octal) → `normalizeNumericIPv4`.
3. **Hostname público resolvendo para IP privado** → `isHostnameResolvablyPrivate` (best-effort `node:dns`).

Cobertura dedicada: `src/lib/__tests__/flow-executor-http-ssrf-hardening.test.ts` — **6 / 6 PASS**. Regressão HTTP anterior — **10 / 10 PASS**.

### Contagem final no momento do freeze

- **Critical abertos: 0**
- **High abertos: 0**

---

## 4. Pendência única — Provider Acceptance

**Gate externo pendente:** PROVIDER ACCEPTANCE — WHATSAPP CLOUD REAL.

Esta pendência **não reabre desenvolvimento funcional**.

Quando existir canal WhatsApp Cloud real disponível para o tenant piloto, será executada uma missão isolada de aceitação contendo somente:

- outbound text real;
- inbound real;
- `provider_message_id`;
- WAIT_REPLY;
- Menu;
- áudio PTT;
- imagem;
- vídeo;
- arquivo;
- retomada de run;
- continuidade após resposta;
- fluxo completo até `COMPLETED`;
- verificação de `messages`, `flow_runs`, `flow_run_steps`, `flow_events`, Guardian, DLQ.

### Critério de promoção

- **Se tudo passar** → alterar status para **FULL PRODUCTION READY**.
- **Se encontrar Critical/High** → abrir missão corretiva pontual, escopo fechado, regressão obrigatória.
- **Proibido** adicionar funcionalidades durante Provider Acceptance.

---

## 5. Limitações conhecidas (documentadas, não bloqueantes)

- Provider WhatsApp real não exercido no Gate — pendente Provider Acceptance.
- IA sem timeout explícito no fetch do gateway (usa default do runtime).
- HTTP: DNS rebinding com TTL curto entre lookup e connect — residual arquitetural, mitigado por `redirect: "manual"` + hardening de IPs privados.
- HTTP: IPv6-mapped-IPv4 (`::ffff:127.0.0.1`) não normalizado.
- Guardian alerter: 5 testes usam `vi.stubGlobal` incompatível com runner Bun (código de produção do alerter funciona).
- Limitações oficiais da Meta (editar mensagem free-form, revoke no Cloud) permanecem como limitação de plataforma, não como ações a implementar.

---

## 6. Backlog Pós-V1

Itens explicitamente **não implementar** durante o congelamento:

- Randomizador Sequencial;
- Analytics avançado;
- CTR por bloco;
- Métricas de conversão;
- Integrações dedicadas;
- Copiloto IA do Builder;
- Templates;
- Marketplace;
- Melhorias avançadas de IA (timeout configurável, prompt-template in-node);
- Uploader in-node de mídia;
- Correção dos 5 testes Guardian (migração Bun/Vitest);
- IPv6-mapped-IPv4 no SSRF guard;
- Demais Medium/Low identificados nas missões FB-10.4E e FB-10.5;
- Toda nova ideia surgida a partir desta data.

Estes itens permanecem registrados apenas como referência de roadmap futuro.

---

## 7. Política de congelamento

Flow Builder V1 está funcionalmente congelado.

**Alterações permitidas somente mediante:**

- evidência reproduzível;
- classificação Critical ou High;
- missão de escopo fechado;
- correção mínima;
- regressão obrigatória.

**Novas funcionalidades pertencem ao roadmap Pós-V1.**

### Proibido durante o congelamento

- Criar FB-10.6;
- adicionar novos blocos;
- adicionar novas funcionalidades;
- realizar redesign;
- refatorar por preferência técnica;
- implementar itens Pós-V1;
- reabrir missões encerradas sem bug comprovado.

### Permitido durante o congelamento

1. Corrigir bug **Critical** comprovado.
2. Corrigir bug **High** com impacto real.
3. Executar **Provider Acceptance**.
4. Corrigir exclusivamente bugs **Critical/High** encontrados no Provider Acceptance.
5. Realizar regressão após qualquer correção autorizada.

Todo item **Medium/Low** ou nova ideia → **BACKLOG PÓS-V1**.

---

## 8. Critérios para reabrir o módulo

O congelamento só pode ser rompido quando ocorrer **um** dos seguintes:

1. **Bug Critical** com evidência reproduzível — abre missão corretiva pontual.
2. **Bug High** com impacto operacional real e evidência — abre missão corretiva pontual.
3. **Provider Acceptance** — missão isolada com escopo já definido na seção 4.
4. **Correção pós-Provider Acceptance** — restrita a Critical/High encontrados durante essa missão.
5. **Promoção formal para V2** — decisão de produto separada, fora do ciclo V1.

Qualquer reabertura fora destes cinco casos é violação da política de congelamento.

---

## 9. Referências

- Gate final: [`FLOW-BUILDER-V1-FINAL-PRODUCTION-ACCEPTANCE.md`](./FLOW-BUILDER-V1-FINAL-PRODUCTION-ACCEPTANCE.md)
- Sumário executivo: [`FLOW-BUILDER-V1-EXECUTIVE-SUMMARY.md`](./FLOW-BUILDER-V1-EXECUTIVE-SUMMARY.md)
- Última missão funcional: [`FB-10.5-condition-http-validation.md`](./FB-10.5-condition-http-validation.md)
- Auditoria de gaps: [`FB-10.4E-final-functional-gap-audit.md`](./FB-10.4E-final-functional-gap-audit.md)
- Motor de fluxos: [`../../flow-engine.md`](../../flow-engine.md)

---

## ERRATA · 2026-07-19 (FB-12.1)

O status **INTERNALLY PRODUCTION READY** deste documento e do `FLOW-BUILDER-V1-FINAL-PRODUCTION-ACCEPTANCE.md` foi emitido sem exercitar o round-trip real (UI → zod de `saveFlowGraph` → banco → reload). O Gate Visual Final descobriu um **P0 de persistência** que rejeitava qualquer fluxo contendo `menu`, `action`, `flow_connection` ou `randomizer` (toast "Erro ao salvar") por divergência entre o Registry e o enum `VALID_NODE_KINDS` do server function.

Corrigido em **FB-12.1** com fonte canônica única (`src/features/flow-builder/blocks/kinds.ts`) consumida por Registry, V3, Runtime e Persistência, mais testes de paridade + round-trip anti-regressão. Detalhes: [`FB-12.1-persistence-fix.md`](./FB-12.1-persistence-fix.md).

Status revisado: **INTERNALLY PRODUCTION READY** confirmado após FB-12.1. Provider Acceptance segue **PENDING**.
