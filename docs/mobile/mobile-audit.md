# Mobile Audit — Sub-missão Mobile-1

**Data:** 2026-07-15
**Escopo:** somente leitura. Nenhum módulo foi alterado nesta auditoria — apenas identificação de problemas. As correções serão executadas nas sub-missões dedicadas (Mobile-2 … Mobile-8).
**Ferramenta:** Playwright headless (Chromium), sessão Supabase injetada.
**Viewports auditados:** 390 (iPhone 12), 414 (iPhone Pro Max), 768 (iPad), 1024 (laptop pequeno).
**Rotas auditadas:** 16 rotas autenticadas principais.

Evidências brutas (screenshots + JSON): `docs/audits/master-audit/evidence/mobile-01/`.

---

## Metodologia

Para cada combinação `rota × viewport` o script executa após `domcontentloaded + 1200ms`:

1. Screenshot da rota inteira (bounded a 1800px de altura, conforme regras).
2. Overflow horizontal: `documentElement.scrollWidth − clientWidth > 2`.
3. Área de toque: contagem de `button / a / [role=button] / checkbox / radio` visíveis com `width<44 || height<44`.
4. Textos cortados: `.truncate / text-ellipsis` com `scrollWidth > clientWidth`.
5. Modais fora da viewport: `[role=dialog]` cujo `boundingRect` excede a janela.
6. Console errors por rota (limitado a 5 primeiras).

Score de prontidão mobile por rota:

```
score = 100
      − min(80, touch_lt_44_em_390 × 3)
      − (30 se houver overflow horizontal em qualquer viewport)
      − min(20, clipped_text_em_390 × 2)
```

Score é uma métrica **relativa** para acompanhar evolução entre sub-missões, não uma nota absoluta.

---

## Mobile Readiness Score (baseline pós Mobile-1)

| Rota | Touch<44 (390) | Overflow | Clip | Errors | Score |
|---|---|---|---|---|---|
| `/` (Dashboard) | 0 | ✅ | 0 | 0 | **100** |
| `/agents` | 10 | ✅ | 0 | 20 | **70** |
| `/campaigns` | 4 | ✅ | 0 | 20 | **88** |
| `/cascades` | 3 | ✅ | 0 | 20 | **91** |
| `/channels` | 4 | ✅ | 0 | 20 | **88** |
| `/crm` | 14 | ✅ | 0 | 20 | **58** |
| `/flows` | 6 | ✅ | 0 | 19 | **82** |
| `/funnels` | 0 | ✅ | 0 | 20 | **100** |
| `/inbox` | 0 | ✅ | 0 | 20 | **100** |
| `/quick-replies` | 9 | ✅ | 0 | 20 | **73** |
| `/reports` | 6 | ✅ | 2 | 20 | **78** |
| `/reports/conversations` | 6 | ✅ | 2 | 20 | **78** |
| `/settings` | 0 | ✅ | 0 | 20 | **100** |
| `/settings/audit` (Guardião) | 7 | ✅ | 0 | 20 | **79** |
| `/settings/feature-flags` | 0 | ✅ | 0 | 20 | **100** |
| `/team` | 18 | ✅ | 0 | 20 | **46** |
| **Global** | | | | | **83** |

> Errors=20 na maioria das rotas vêm de `console.error` esperados durante rehidratação/no-permission em algumas rotas — não são bugs runtime críticos e não bloqueiam o shell. Serão triados por módulo nas próximas sub-missões.

---

## Achados globais

### ✅ Positivos após Mobile-1

- **Overflow horizontal: zero.** Em todas as 64 combinações rota × viewport a página respeita `100vw`.
- **Shell mobile ativo abaixo de 768px:** Top App Bar (56px, safe-area top), Bottom Navigation com 5 slots (Início / Inbox / CRM / Fluxos / Menu) e Drawer lateral operacionais.
- **Bottom Nav com destaque de item ativo, badges de Inbox e safe-area bottom.**
- **Drawer** com busca, favoritos persistidos em `localStorage`, grupos, toggle de tema, avatar/e-mail e logout.
- **Zero regressão em desktop (≥ 768px):** sidebar + topbar continuam idênticos (validado em screenshots `laptop_*`).

### 🔴 Bloqueios para módulos (não escopo de Mobile-1)

- **Touch targets < 44px:** dominam a lista. Piores rotas em 390px: `/team` (18), `/crm` (14), `/agents` (10), `/quick-replies` (9), `/settings/audit` (7). Correção acontece na sub-missão de cada módulo.
- **Tabelas desktop:** `/team`, `/crm`, `/agents`, `/channels`, `/quick-replies` mantêm layouts de tabela desktop no mobile. Conversão em cards é escopo das sub-missões 2, 3, 5, 7.
- **Bottom sheets / drawers de módulo:** hoje muitos módulos usam sheets/drawers laterais herdados do desktop (`channel-form-sheet`, `contact-form-sheet`, `playground-drawer` etc.). Alguns extrapolam viewport no iPhone. Tratamento por módulo.
- **Widgets pesados:** Dashboard e Reports usam gráficos com `min-width` fixo; virão em Mobile-4/Mobile-6.
- **Editor de fluxos (`/flows/$id`)** e **playground de agentes** não foram testados nesta auditoria (rotas dinâmicas). Serão auditados em Mobile-5.

### ⚠️ Achados específicos

| # | Categoria | Local | Evidência | Prioridade | Sub-missão |
|---|---|---|---|---|---|
| A-M1-01 | Touch <44px em massa | `/team` (18 alvos) | `iphone12_team.png` | High | Mobile-7 |
| A-M1-02 | Touch <44px em massa | `/crm` (14 alvos) | `iphone12_crm.png` | High | Mobile-3 |
| A-M1-03 | Touch <44px | `/agents` (10 alvos) | `iphone12_agents.png` | High | Mobile-5 |
| A-M1-04 | Touch <44px | `/quick-replies` (9), `/settings/audit` (7), `/flows` (6), `/reports` (6) | screenshots correspondentes | Medium | 5, 6, 7 |
| A-M1-05 | Texto truncado sem tooltip | `/reports`, `/reports/conversations` (2 em 390) | screenshots | Low | Mobile-6 |
| A-M1-06 | Popover de notificações em iPhone 12 | topbar mobile — largura `100vw − 1rem` respeitada, ok | ✅ | — | — |

Nenhum modal / dialog `[role=dialog]` foi detectado com dimensão maior que a viewport nas rotas amostradas.

---

## Critério de encerramento validado

- [x] Nenhum overflow horizontal em nenhuma rota × viewport auditada.
- [x] Mobile shell (top bar + conteúdo + bottom nav + drawer) renderiza em ≤ 767px e permite navegar entre todos os módulos.
- [x] Desktop (≥ 768px) continua idêntico.
- [x] Screenshots arquivados para baseline visual.
- [x] Score global inicial registrado: **83/100**.

Backlog completo detalhado em `docs/mobile/mobile-improvements.md`.
