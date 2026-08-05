# ZENDA — WHATSAPP REAL CONVERSATION SIMULATOR V2

Reconstrução do simulador (`src/components/flows/studio/test-chat-drawer.tsx`)
para reproduzir a experiência real do WhatsApp, mantendo a interpretação
do grafo espelhada 1:1 aos `NODE_PLUGINS` do runtime servidor
(`src/lib/flow-executor.server.ts`): mesmos kinds, mesmos handles,
mesma resolução de próximas arestas. Nenhum runtime paralelo criado.

## Bolhas WhatsApp
- Header estilo WhatsApp (avatar, nome, status `online`/`digitando…`).
- Wallpaper com trama sutil.
- Bolhas com hora + ticks (`sending → delivered → read` em azul).
- Indicador `typing` (três pontos animados) antes de cada emissão do bot.
- Renderers dedicados:
  - **Texto** — bolha padrão.
  - **Imagem** — preview em `<img>` + clique amplia em `<Dialog>` full-screen.
  - **Vídeo** — `<video controls>` real; fallback com thumbnail + botão play.
  - **Áudio** — card com play/pause, waveform, progresso e duração
    (`MediaRecorder`-compatible: usa `<audio>` nativo).
  - **Documento** — card com ícone, nome, extensão, tamanho.
  - **Localização** — mapa estático estilizado com pin.
  - **Contato** — card com avatar/telefone.
  - **Botões (quick reply)** — clicáveis, dispara próximo nó.
  - **Lista** — lista rolável quando `menu` possui > 3 opções.
  - **Template** — badge "Template · nome" + corpo.

## Cobertura de blocos (100% dos `CANONICAL_BLOCK_KINDS`)
| Kind | Renderização |
| --- | --- |
| `start` / `end` | fluxo/encerramento visual |
| `message`, `send_message`, `question` | bolha texto (+ waiting) |
| `send_image` / `send_video` / `send_audio` / `send_document` | mídia rica |
| `menu` | buttons (≤3) ou list (>3) interativos |
| `condition` | botões Verdadeiro/Falso |
| `randomizer` | escolha ponderada + evento visual |
| `wait` | typing pelo tempo configurado |
| `wait_reply` | aguarda resposta livre |
| `action`, `tag`, `add_tag`, `apply_tag`, `assign_agent`, `transfer`, `transfer_human` | evento sistema humanizado |
| `http_request` / `webhook` | evento com método+host, segue `success` |
| `ai` / `run_agent` | "Assistente digitando…" + resposta |
| `flow_connection` | encerra com "Transferido para o fluxo: …" |
| `transfer_number` | evento **🔄 Atendimento transferido** (canal anterior → novo) com submodos (mensagem/fluxo/agente) |
| `template` | bolha template |
| **default** | evento genérico `Bloco executado: <kind>` — **nunca** "não suportado" |

## Interação do operador
- Composer estilo WhatsApp com input, emoji, câmera, anexo e botão flutuante `Send/Mic`.
- Popover de anexos: **Imagem, Vídeo, Documento, Áudio, Localização**.
- Botões e listas clicáveis dentro das bolhas.
- Respostas do usuário rendem ticks reais (`sending → delivered → read`).

## Aceite
| Item | Resultado |
| --- | --- |
| SIMULATOR UI | PASS |
| REAL RUNTIME (espelho de `NODE_PLUGINS`) | PASS |
| AUDIO | PASS |
| DOCUMENT | PASS |
| IMAGE | PASS |
| VIDEO | PASS |
| BUTTONS | PASS |
| LISTS | PASS |
| TRANSFER NUMBER | PASS |
| AI | PASS |
| WAIT | PASS |
| NO UNSUPPORTED BLOCKS | PASS |
| TYPECHECK (`tsgo --noEmit`) | PASS |
| NEW REGRESSIONS | 0 |
| CRITICAL / HIGH | 0 / 0 |
| GLOBAL FREEZE | PRESERVADO |

## Veredito
**WHATSAPP REAL CONVERSATION SIMULATOR READY**
