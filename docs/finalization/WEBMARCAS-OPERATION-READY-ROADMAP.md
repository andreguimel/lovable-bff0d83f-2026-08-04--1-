# WebMarcas Operation Ready — Roadmap Finito

**Marco alvo:** a própria WebMarcas opera Zenda como sistema único no dia a dia, substituindo WhatsApp paralelo / planilhas / docs externos.
**Ponto de partida:** Flow Builder V1 congelado, plataforma internamente estável, 2 canais mock, 0 canal real.
**Estimativa total:** **11–13 dias úteis** (4 etapas + Final Gate).
**Regra herdada:** nenhuma etapa reabre o Flow Builder ou seus kinds. Provider Acceptance é escopo cirúrgico, sem novos blocos.

---

## ETAPA W1 — Estabilização Guardian & Frontend

**Objetivo:** zerar os 2 HIGH abertos e reduzir a poluição de Medium recorrentes que contaminam o Guardian e a UX do operador.

**Escopo (fechado):**
- Corrigir `N.map is not a function` na lista de quick-replies (defesa contra `undefined`/objeto).
- Corrigir `k.filter is not a function` (defesa análoga).
- Corrigir ordem de registro de handlers em `realtime:conversations:all` (`postgres_changes` antes de `subscribe()`).
- Garantir mount do `MobileFabProvider` nas rotas mobile que consomem `useMobileFab`.
- Investigar e corrigir 3–5 casos de `Minified React error #418` (hidratação SSR/CSR) mais frequentes.
- Marcar como resolvidos os 21 incidents em `guardian_incidents` após correção; higienizar histórico.

**Entregáveis:**
- Correções cirúrgicas (sem refactor).
- Regressão `bun test` + `tsgo` verdes.
- Guardian score visível 100 por 24h.
- Relatório `docs/audits/finalization/W1-guardian-frontend-stabilization.md`.

**Critério de aceite:**
- 0 incidents HIGH abertos no Guardian.
- ≤3 incidents MEDIUM abertos no Guardian.
- Nenhuma regressão de teste.

**Dependências:** nenhuma.
**Estimativa:** **2 dias úteis.**
**Bloqueia WebMarcas?** SIM · **Bloqueia SaaS?** SIM.
**DONE quando:** relatório encerrado + Guardian limpo + suite verde.

---

## ETAPA W2 — Presets WebMarcas + Inbox UX V1

**Objetivo:** entregar a camada fina Marcas & Patentes que transforma Zenda no sistema real da WebMarcas, e completar as 5 ações Inbox essenciais para atendimento diário.

**Escopo (fechado):**

*Presets WebMarcas (configuração + seed, sem módulo novo):*
- Custom fields dedicados em `contacts`: `processo_inpi`, `numero_processo`, `classe_nice`, `titular`, `data_deposito`, `status_inpi`, `procurador`.
- Pipeline dedicado no Kanban do CRM: `Prospecção → Pedido depositado → Exame → Publicação → Concessão → Manutenção`.
- Quick replies preset (10–15 respostas jurídicas típicas: exigência, publicação, taxa, renovação).
- Tags obrigatórias seed: `Marca`, `Patente`, `Renovação`, `Exigência`, `Publicação`.
- 1 fluxo template publicado: "Cobrança de renovação anual".
- Tela mínima de configuração/aplicação dos presets no CRM.

*Inbox UX V1 (5 ações restantes conforme master plan §13):*
- Marcar como não lida.
- Arquivar conversa.
- Buscar dentro da conversa.
- Info drawer da conversa (contato + canal + tags + histórico rápido).
- Seleção múltipla + ações em lote (marcar/arquivar).

**Entregáveis:**
- Migration com custom fields + seeds de tags/quick-replies/pipeline.
- Componentes UI das 5 ações Inbox.
- 1 fluxo template exportado como JSON versionado.
- Testes cobrindo cada ação nova.
- Relatório `docs/audits/finalization/W2-webmarcas-presets-inbox-ux.md`.

**Critério de aceite:**
- Presets aplicáveis por qualquer novo tenant WebMarcas via 1 clique.
- 5 ações Inbox funcionais desktop + mobile.
- 0 High/Critical aberto após a etapa.

**Dependências:** W1 verde.
**Estimativa:** **5 dias úteis.**
**Bloqueia WebMarcas?** SIM · **Bloqueia SaaS?** NÃO (SaaS pode viver sem presets INPI).
**DONE quando:** relatório encerrado + presets seedados + 5 ações merged + suite verde.

---

## ETAPA W3 — Perf Inbox + Provider Acceptance WhatsApp Real

**Objetivo:** entregar a única prova externa pendente do Flow Builder V1 e destravar operação real; simultaneamente cortar o cold-load do Inbox de ~9s para <3s.

**Escopo (fechado):**

*Performance Inbox (F-01, F-05):*
- Batch `signMany(ids[])` para URLs assinadas de mídia (elimina N+1).
- Cache de sessão `auth.getUser()` durante o boot (1× por sessão).
- `Promise.all` nos fetches iniciais do Inbox.
- Bundle split por rota (Vite dynamic import).
- Alvo: cold-load < 3s p95 desktop.

*Provider Acceptance (herdado do freeze do FB, sem novos blocos):*
- Conectar canal WhatsApp Cloud real da WebMarcas (App ID, App Secret, verify token, Phone Number ID, WABA ID, webhook URL).
- Executar suíte de aceitação definida em `FLOW-BUILDER-V1-FREEZE.md` §4:
  outbound text real · inbound real · `provider_message_id` · WAIT_REPLY · Menu · áudio PTT · imagem · vídeo · arquivo · retomada de run · continuidade após resposta · fluxo completo até COMPLETED · verificação de `messages`, `flow_runs`, `flow_run_steps`, `flow_events`, Guardian, DLQ.

**Entregáveis:**
- Cold-load Inbox medido antes/depois (evidência p50/p95).
- Canal real ativo em `channels` com `provider='whatsapp_cloud'` e `credentials` populadas.
- Relatório `docs/audits/finalization/W3-perf-inbox-and-provider-acceptance.md`.
- Se **Critical/High** encontrados no Provider Acceptance: missão corretiva pontual (autorizada pela política do freeze).

**Critério de aceite:**
- Cold-load Inbox < 3s p95.
- 100% dos itens da suíte Provider Acceptance PASS.
- Se PASS: Flow Builder promovido de **B → A** (FULL PRODUCTION READY).
- 0 High/Critical aberto após a etapa.

**Dependências:** W2 verde + credenciais Meta WebMarcas disponíveis.
**Estimativa:** **4 dias úteis.**
**Bloqueia WebMarcas?** SIM · **Bloqueia SaaS?** SIM.
**DONE quando:** canal real trocando mensagens + suíte Provider Acceptance verde + perf medida + relatório encerrado.

---

## ETAPA W4 — RC WebMarcas Operation Lock

**Objetivo:** validar em produção real, com a equipe real, que a WebMarcas consegue operar 1 dia útil inteiro sem WhatsApp paralelo, sem planilha externa, sem doc manual — 100% dentro de Zenda.

**Escopo (fechado):**
- Preparar checklist operacional por área (Comercial, Jurídico/INPI, Financeiro, Atendimento, Diretoria) — herdada de `RELEASE_1.0_MASTER_PLAN.md` §RC-00.
- Executar 1 dia útil inteiro em produção real.
- Coletar evidências: número de conversas atendidas, contatos criados, fluxos disparados, tarefas concluídas, erros observados, atritos reportados pelos operadores.
- Preencher `docs/webmarcas/OPERATION_LOCK_REPORT.md` com assinatura dos operadores.
- Registrar decisão explícita para cada eventual atrito: correção imediata (Critical/High) ou backlog Pós-V1 (Medium/Low).

**Entregáveis:**
- Checklist assinada `docs/webmarcas/OPERATION_CHECKLIST.md`.
- Relatório `docs/webmarcas/OPERATION_LOCK_REPORT.md` assinado.
- Se surgir Critical/High: missão corretiva pontual W4.x com escopo mínimo.

**Critério de aceite:**
- 0 Critical / 0 High aberto ao final do dia.
- Zero ferramentas externas usadas pela WebMarcas durante o dia útil.
- Relatório assinado pelos operadores.

**Dependências:** W3 verde.
**Estimativa:** **1 dia útil** (+ eventuais correções emergenciais).
**Bloqueia WebMarcas?** SIM (é o gate) · **Bloqueia SaaS?** NÃO.
**DONE quando:** relatório assinado + checklist zerada + Guardian score 100.

---

## FINAL GATE — WEBMARCAS OPERATION READY

**Critérios objetivos:**
- ✅ 0 Critical / 0 High abertos.
- ✅ Guardian score 100 por 7 dias corridos.
- ✅ DLQ = 0.
- ✅ Canal WhatsApp Cloud real ativo, trocando mensagens diariamente.
- ✅ Cold-load Inbox < 3s p95.
- ✅ 5 ações Inbox V1 mergeadas.
- ✅ Presets WebMarcas aplicáveis.
- ✅ RC WebMarcas Operation Lock assinado.
- ✅ Flow Builder V1 promovido para **A (FULL PRODUCTION READY)**.

**Ao passar:** status oficial da plataforma vira **WEBMARCAS OPERATION READY**. Documento `docs/finalization/WEBMARCAS-OPERATION-READY-CERTIFICATION.md` é emitido registrando a data, evidências e assinaturas.

---

## Resumo em uma tela

| Etapa | Nome | Dias | Bloqueia WM | Bloqueia SaaS |
|---|---|:-:|:-:|:-:|
| W1 | Estabilização Guardian & Frontend | 2 | SIM | SIM |
| W2 | Presets WebMarcas + Inbox UX V1 | 5 | SIM | NÃO |
| W3 | Perf Inbox + Provider Acceptance | 4 | SIM | SIM |
| W4 | RC WebMarcas Operation Lock | 1 | SIM | NÃO |
| — | **FINAL GATE — WEBMARCAS OPERATION READY** | — | — | — |

**Total: 4 etapas + Final Gate · 11–13 dias úteis linear · ~9 dias úteis com paralelismo (W1 pode preceder W2/W3 em paralelo se houver 2 frentes).**
