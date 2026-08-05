# Recomendação Final — Fase 1

## Pergunta

> O Core pode continuar congelado ou existe algum risco crítico que obrigue uma intervenção antes do piloto?

## Resposta objetiva

**O Core PODE continuar congelado para o piloto WebMarcas.**

Nenhum item **Critical** foi identificado. O congelamento RC3.1 continua correto e não deve ser suspenso.

## Condicionantes recomendados (não obrigatórios, mas fortemente sugeridos)

Antes de abrir o piloto para uso público / múltiplas empresas, 4 itens **High** merecem virar sub-missões curtas (cada uma <1 dia, escopo cirúrgico, sem tocar arquitetura):

| Prioridade | Item | Custo | Impacto |
|:-:|---|---|---|
| **1** | **SEC-H-01** — Corrigir `exec_read_sql` (whitelist ou revoke EXECUTE) | ~2h | Fecha risco de leitura cross-tenant |
| **2** | **SEC-H-03** — Ligar Password HIBP Check | ~5min | Impede senhas vazadas |
| **3** | **OBS-H-01** — Alerting externo (email admin quando incident High/Critical) | ~4h | Time descobre problemas em vez de o cliente |
| **4** | **OPS-H-01** — Runbook de incidente (só documentação) | ~2h | Time sabe o que fazer em produção |

Total: **~1 dia** de trabalho, tudo isolado, tudo dentro da regra do congelamento (não altera arquitetura, runtime, event bus, providers ou banco estrutural).

**Para o piloto WebMarcas específico** (canal real WhatsApp, 1 tenant, time controlado): os 4 itens acima são **recomendação forte**, não bloqueio. O piloto pode iniciar **sem eles** se houver time de suporte próximo. Todos os 4 podem ser tratados em **paralelo ao piloto** nos primeiros dias.

## Itens que ficam para depois do piloto (sem afetar go-live)

- Toda a lista **Medium** e **Low** (~35 itens) — dívida legítima, mas não bloqueante.
- Todos os `RT-H-*` (runtime) — já conhecidos, monitorados, sem impacto no fluxo canônico validado em RUNTIME-PARITY.
- Retenção de tabelas (DB-H-02/03, EVT-H-01) — problema só em 30+ dias de produção.

## Confirmação do estado congelável

| Camada | Congelável? | Justificativa |
|---|:-:|---|
| Arquitetura | ✅ | Boundaries respeitados, runtime único, RPC canônico |
| Banco | ✅ | 69 tabelas com RLS, GRANTs corretos, padrão uniforme |
| Runtime | ✅ | Consolidado em RUNTIME-CANONICAL, validado em RUNTIME-PARITY |
| Segurança | ✅* | *Após tratar SEC-H-01 e SEC-H-03 |
| APIs | ✅ | 263 server fns + 9 rotas HTTP, todas validadas |
| Eventos | ✅ | 9 tipos determinísticos emitidos consistentemente |
| Storage | ✅ | 4 buckets privados, upload validado |
| Performance | ✅ | Sem carga real para justificar otimização |
| Observabilidade | ✅* | *Após tratar OBS-H-01 |
| Operações | ✅* | *Após tratar OPS-H-01 |

## Ação sugerida ao usuário

1. **Aprovar** a Fase 1 (auditoria concluída, 10 documentos entregues).
2. **Decidir** entre 2 caminhos:
   - **Caminho A (recomendado):** autorizar sub-missão única "Fase 1.5 — 4 Highs pré-piloto" (SEC-H-01 + SEC-H-03 + OBS-H-01 + OPS-H-01, ~1 dia total).
   - **Caminho B:** iniciar piloto WebMarcas imediatamente, tratar os 4 Highs em paralelo nos primeiros dias.
3. **Manter** o congelamento RC3.1 no restante — nenhum outro item do backlog vira missão sem aprovação individual.

**Status final da Fase 1:** ✅ **Encerrada com sucesso**. Documentação completa entregue. Nenhum código alterado. Congelamento preservado.
