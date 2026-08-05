# Scroll Matrix — Todas as Rotas (pós RC3.1)

| # | Rota | Desktop | Mobile | Nota |
|---|------|:-------:|:------:|------|
| 1 | `/` (dashboard) | ✅ | ✅ | main-auto |
| 2 | `/inbox` | ✅ | ✅ | scroll interno (colunas) |
| 3 | `/inbox/$conversationId` | ✅ | ✅ | fullscreen mobile |
| 4 | `/crm` | ✅ | ✅ | main-auto |
| 5 | `/crm/$contactId` | ✅ | ✅ | main-auto |
| 6 | `/flows` | ✅ | ✅ | main-auto |
| 7 | `/flows/$flowId` | ✅ | ✅ | canvas fullscreen |
| 8 | `/flows/$flowId/runs` | ✅ | ✅ | main-auto |
| 9 | `/agents` | ✅ | ✅ | main-auto |
| 10 | `/agents/$agentId` | ✅ | ✅ | studio interno |
| 11 | `/campaigns` | ✅ | ✅ | main-auto |
| 12 | `/cascades` | ✅ | ✅ | main-auto |
| 13 | `/channels` | ✅ | ✅ | main-auto |
| 14 | `/funnels` | ✅ | ✅ | main-auto |
| 15 | `/quick-replies` | ✅ | ✅ | main-auto |
| 16 | `/team` | ✅ | ✅ | main-auto |
| 17 | `/team/$memberId` | ✅ | ✅ | main-auto |
| 18 | `/team/roles` | ✅ | ✅ | main-auto |
| 19 | `/reports` (index) | ✅ | ✅ | main-auto |
| 20 | `/reports/conversations` | ✅ | ✅ | main-auto |
| 21 | `/reports/broadcasts` | ✅ | ✅ | main-auto |
| 22 | `/reports/cascades` | ✅ | ✅ | main-auto |
| 23 | `/settings` (index) | ✅ | ✅ | main-auto |
| 24 | `/settings/audit` (Guardião) | ✅ | ✅ | mobile home dedicada |
| 25 | `/settings/features` | ✅ | ✅ | main-auto |
| 26 | `/settings/feature-flags` | ✅ | ✅ | main-auto |
| 27 | `/auth` (landing) | ✅ | ✅ | scroll natural body |
| 28 | `/invite/$token` | ✅ | ✅ | scroll natural body |
| 29 | `404` | ✅ | ✅ | scroll natural body |

## Componentes overlay

| Componente | Backdrop | Restaura scroll | Nota |
|------------|:--------:|:---------------:|------|
| Dialog | ✅ blur | ✅ Radix + safeguard | RC3 tokenizado |
| AlertDialog | ✅ blur | ✅ Radix + safeguard | RC3 tokenizado |
| Sheet (lateral) | ✅ blur | ✅ Radix + safeguard | RC3 tokenizado |
| Drawer (vaul mobile) | ✅ blur | ✅ Vaul + safeguard | RC3 tokenizado |
| Popover / DropdownMenu | — | ✅ Radix | não bloqueia body |
| Command Palette (⌘K) | ✅ Dialog | ✅ Radix + safeguard | via Dialog |
| BottomSheet (mobile actions) | ✅ | ✅ | via Sheet |

## Total

- Rotas auditadas: **29**
- Aprovadas: **29 / 29** (100 %)
- Componentes overlay: **7 / 7** (100 %)
- **Nenhuma rota com scroll travado.**
