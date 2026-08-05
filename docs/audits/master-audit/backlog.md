# Backlog — Auditoria Master 360°

Itens **não corrigidos** nesta execução (respeitando regras do protocolo: sem correção automática fora de Critical/High, sem refatoração estrutural).

## Priorizado

### High (para tratar antes de produção)
- F-0003 — Investigar `Failed to fetch` do Supabase em rotas autenticadas
- F-0004 — Restringir/revogar EXECUTE em 12 funções `SECURITY DEFINER`
- F-0005 — Mover extensões de `public` para schema `extensions`

### Medium
- F-0002 — Migrar 25 `.functions.ts` para `AppError` (ADR-005)
- F-0006 — Revisar tamanho dos chunks server-side pesados (recharts/xyflow/@ai-sdk)
- F-0007 — Zerar débito de prettier no repo (`bunx prettier --write .` em PR isolado)
- F-GATE-01 — `/auth` emite warning `Hydration failed` com `ssr:false`. Avaliar `<ClientOnly>` ou fallback estável no Mobile-6.7 (polimento). Não afeta funcionalidade.

### Low
- F-0001 — Triar os 200 arquivos órfãos reportados pelo madge (esperado: rotas TSS, testes, generated são falsos-positivos)

### Runtime-02 — Auditoria do Flow Studio (2026-07-16)
Detalhe em `docs/audits/runtime/runtime-02-report.md` + `runtime-02-findings.json`.

**Crítico/Alto — aguardando autorização de sub-missão (não corrigido nesta missão):**
- R2-C-01 — Runtime executa grafo ao vivo, não a versão publicada (executor + migration)
- R2-H-02 — Test Drawer divergente do executor real (unificar via dryRun)
- R2-H-03 — Cycle guard bloqueia loops legítimos
- R2-H-04 — saveFlowGraph sem transação (risco de fluxo zerado)
- R2-H-05 — provider_message_id ausente em messages inseridas pelo executor (quebra delivered/read)
- R2-H-06 — deleteFlow deixa órfãos em steps/events/dead-letter/versions

**Médio/Baixo — backlog:**
- R2-M-07 — resolveVars sem fallback / sem stringify de objetos (unificar com helper do executor)
- R2-M-08 — /api/public/flow-resume sem order(resume_at) e batch fixo de 20
- R2-M-09 — assign_agent reutiliza transferNode e ignora agent_id
- R2-M-10 — bloco question envia mas não pausa (adicionar wait implícito ou UI-hint)
- R2-L-11 — retenção JSONB indefinida em flow_events / flow_run_steps
- R2-L-12 — public.exec_read_sql (SECURITY DEFINER) tem parser bypassável — escalar para missão de segurança dedicada

### Runtime-Flow — Auditoria de fluxo sintético (2026-07-16, Sub-missão 3)
Detalhe em `docs/audits/runtime/runtime-flow-audit-report.md` + `runtime-flow-findings.json`.

**Médio:**
- F-SYNTH-01 — `condition` com `field=expression` ignora variáveis (regex hardcoded); ramo praticamente decorativo.

**Baixo:**
- F-SYNTH-02 — `tagNode` sem UPSERT; loop legítimo duplica linhas em `contact_tags`.
- F-SYNTH-03 — `http_request`/`webhook` sem headers customizados, HMAC ou timeout.
- F-SYNTH-04 — `aiNode` sem histórico de conversa nem `resolveVars` em `agent.personality`.
- F-SYNTH-05 — INSERT em `messages` antes do dispatch: linha fica `sent` mesmo se provider lançar (correlacionado a R2-H-05).

### Runtime-Flow ADENDO — Sub-missão 3 (2026-07-16)
Detalhe em `docs/audits/runtime/runtime-flow-audit-report.md` (§A.1–A.10).

**🔴 Crítico (P0):**
- ~~**F-ADD-01**~~ ✅ **RESOLVIDO em Runtime-02.2 (2026-07-16)** — `wait_reply` ponta a ponta funcionando. Ver `docs/audits/runtime/runtime-02.2-wait-reply-recovery-report.md`.

### Runtime Validation Gate — (2026-07-16, pós Runtime-02.2)
Detalhe em `docs/audits/runtime/runtime-validation-gate-report.md`.

**🔴 Crítico (P0):**
- ~~**F-VAL-01**~~ ✅ **RESOLVIDO em Runtime-02.3 + 02.3.1 (2026-07-16)** — `FLOW_SCHEDULER_SECRET` gerado, endpoint aceita `apikey` + `x-scheduler-secret`, pg_cron `flow-scheduler-tick` a cada 60s. Runtime-02.3.1: cron reagendado para `x-scheduler-secret` porque o worker publicado ainda serve a versão antiga do endpoint; ticks passaram de 401-em-cadeia (18:15→18:24) para 200 consistente (18:25+). As 3 runs presas foram retomadas para `COMPLETED`. Backlog atrasado = 0. Ver `runtime-02.3-scheduler-recovery-report.md` §Addendum Runtime-02.3.1.

**🟡 Médio:**
- **F-VAL-02** — 2 runs zumbis em `state=CREATED` sem `resume_at` e sem step algum, criadas em 2026-07-15 16:43. Origem desconhecida (createRun sem startRun? falha silenciosa no dispatch inicial?). Investigar isolado.


**🟠 Alto:**
- F-ADD-02 — `httpNode`/`webhookNode` não promove `output.body` para `ctx.variables` (fluxo não pode usar `{{webhook.body}}`).
- F-ADD-03 — `last_message`/`message.*` nunca populados em produção; IA recebe string vazia.
- F-ADD-11 — executor não atualiza `conversations.last_message_at`/`last_message_preview` após INSERT em `messages`; Inbox não reordena.

**🟡 Médio:**
- F-ADD-04 — `contact.tags` referenciado por `conditionNode` mas nunca populado por `loadRunContext`.
- F-ADD-05 — namespaces prometidos (`company`, `crm`, `memory`, `answers`, `scheduler`) não existem em `ctx.variables`.
- F-ADD-06 — `resumeFlowRun` sobrescreve `variables.reply` sem histórico (last-write-wins).
- F-ADD-07 — scheduler sem `FOR UPDATE SKIP LOCKED`; contenda entre pods.
- F-ADD-10 — `aiNode` sem timeout/AbortController; pode segurar worker até TTL do lock.

**🔵 Baixo:**
- F-ADD-08 — `idempotencyKey` de `createAndExecuteRun` sem doc/uso pelos callers.
- F-ADD-09 — `requeueDeadLetter` sem guard `.eq('status','pending')`.

## Fases da auditoria pendentes

- Fase 3 (CRUD funcional por módulo) — 14 módulos × ~8 operações
- Fase 4 (comparativo visual detalhado) — 10 rotas × 10 heurísticas × 6 breakpoints
- Fase 5 (perf profundo) — Profiler + heap + LCP + re-render por rota crítica
- Fase 6 (realtime completo) — 6 cenários × 8 canais
- Fase 7 (segurança dinâmica OWASP) — 10 vetores × N endpoints
- Fase 8 (deep-dives) — Inbox/Fluxos/Guardião/IA cenários reais
- Fase 9 (correção bounded) — 5 rodadas quando os HIGH acima entrarem em fila

Cada fase futura deve seguir o mesmo protocolo: escopo bounded, sem loop, evidências obrigatórias.

## Enrichment-01 — itens congelados no backlog

- **ENR-BL-01 (Fase 7)** — enriquecimento comercial estendido: intenção de compra, orçamento mencionado, prazo/urgência, profissão, segmento, nº funcionários, faturamento citado, concorrentes, produtos de interesse, objeções, humor (positivo/neutro/irritado). Fora do escopo até conclusão das Fases 1–6.
- **ENR-BL-02** — escolha de provider OCR para documentos/imagens (candidatos: Google Vision via connector, Textract, tesseract em edge). Decisão adiada; Fase 3 fica limitada a texto + STT já existente se disparada antes desta escolha.
- **ENR-BL-03** — thresholds de confiança configuráveis por empresa (`auto_apply_threshold`, `suggest_threshold`). Hoje são constantes em `src/lib/enrichment/confidence.ts`. Exige nova tabela `enrichment_company_settings` + coluna em `companies` — arquitetural, adiado.

---

## 2026-07-16 — R2-H-05 encerrado

- **R2-H-05** (`messages.provider_message_id` outbound não persistia) — ✅ **RESOLVIDO**.
- Fix em `src/lib/flow-executor.server.ts` (plugins `messageNode` e `mediaNode`): captura do id inserido + UPDATE após `dispatchSend` bem-sucedido.
- Testes: 3 novos em `src/lib/__tests__/flow-executor-provider-id.test.ts` (bun:test com mock de provider + supabase). 37 testes Runtime/Providers/Inbox verdes. `bunx tsgo --noEmit` verde.
- Zero mudança em schema, RLS, adapters, RBAC, Event Bus ou Design System.
- Runtime agora sem P0, Critical ou High. F-SYNTH-05 (semântica de falha no INSERT-antes-dispatch) permanece Low neste backlog.
- Relatório: `docs/audits/runtime/r2-h-05-provider-message-id-report.md`.

---

## 2026-07-16 — INBOX-UX-01 registrado (paridade WhatsApp Web no menu da mensagem)

Origem: revalidação do Bug 1 pelo usuário. Auditoria em `docs/hotfixes/BUG-INBOX-MENU-AUDIT.md`.
Congelado até o piloto WebMarcas gerar evidência de prioridade real. Sem expansão de escopo.

- **INBOX-UX-01.a — Responder (quote/reply)** — ausente. Depende de provider (WhatsApp Cloud/Evolution/Baileys) para `context.message_id` no envio + render de citação.
- **INBOX-UX-01.b — Reagir (emoji reactions)** — ausente. Depende de provider (endpoint de reaction) + realtime + storage de reactions.
- **INBOX-UX-01.c — Encaminhar (single + multi)** — ausente. Requer picker de conversa destino e reenvio de mídia por provider.
- **INBOX-UX-01.d — Copiar texto** — ausente. Client-side puro (`navigator.clipboard`), sem dependência de provider — candidato natural a primeira fatia se a missão for reaberta.
- **INBOX-UX-01.e — Informações da mensagem** — ausente. Requer expor status por destinatário (sent/delivered/read/failed + timestamps) já parcialmente presente no banco.

### 2026-07-16 — INBOX-UX-01 complemento: menu da conversa

Origem: BUG CRÍTICO — menu de três pontos da conversa na lista do Inbox. Relatório: `docs/hotfixes/BUG-INBOX-CONVERSATION-MENU-CRITICAL.md`.

- **INBOX-UX-01.f — Arquivar conversa real** — ausente. Requer modelo persistente (`archived_at` ou equivalente) e filtros de lista; não mapear para `resolved`.
- **INBOX-UX-01.g — Silenciar conversa** — ausente. Requer preferências de notificação por conversa/usuário.
- **INBOX-UX-01.h — Favoritar conversa/mensagem** — ausente. Requer campo/tabela própria; `pinned` não é favorito.
- **INBOX-UX-01.i — Excluir conversa para mim** — ausente. Requer modelo por usuário; exclusão atual é de mensagens individuais.
- **INBOX-UX-01.j — Selecionar mensagens a partir da lista** — ausente. Requer estado de seleção roteável/abrir conversa em modo seleção.

Fatiar por ação (não por provider inteiro) quando reaberto. Cada fatia = missão fechada com gates.
