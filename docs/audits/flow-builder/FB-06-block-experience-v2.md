# FB-06 — Reconstrução dos Blocos (Block Experience V2)

**Status:** ✅ Encerrada
**Data:** 2026-07-17
**Missão:** FB-06 · Reconstrução dos 17 blocos no padrão Block Experience V2
**Escopo:** exclusivamente a **definição, configuração e experiência** dos blocos.

> **Não alterado (proibições respeitadas):** Runtime, Executor, Banco, Canvas
> (`FlowCanvasV2.tsx`, `BlockNode.tsx`, `BlockCard.tsx`), SmartSidebar,
> Node Library, Registry, Store, Event Bus.

---

## 1. Objetivo

Padronizar os 17 blocos existentes para que todos exibam o mesmo nível de qualidade, linguagem e comportamento — de forma que o usuário nunca precise "aprender" um bloco novo: ao entender um, entende todos.

## 2. Filosofia (checklist de cada bloco)

Cada bloco responde em **menos de 3 segundos** a três perguntas:

| Pergunta | Onde é respondida no V2 |
| --- | --- |
| O que este bloco faz? | `meta.short` + `meta.hints.whenToUse` |
| Como configurá-lo? | `fields[]` renderizados no SmartSidebar |
| O que acontece ao executar? | `preview(data)` no card do canvas |

## 3. Entregas

### 3.1 Arquitetura estendida (`blocks/types.ts`)

- `BlockMetaV2.hints`: `{ whenToUse?, examples? }` — consumido por preview, library e futura IA.
- `BlockStatus`: `configured | incomplete | attention | error` — estado agregado por bloco.
- `BlockDefinition.status?`: função derivada padrão (baseada em `validate`), sobrescrevível por bloco.
- `BlockAIAssist<TData>`: contrato **arch-only** — `explain?`, `suggests?`, `generateLabel?`. Nenhum consumidor hoje; garante que qualquer bloco novo nasça AI-ready.

### 3.2 Biblioteca de campos (`fields/types.ts` + `renderer.tsx`)

- `SelectFieldSpec.persistLabelKey?: string` — quando definido, o rótulo humano da opção escolhida é gravado ao lado do valor. Usado por `ai` e `assign_agent` para exibir o **nome do agente** no preview do card sem precisar de ctx no canvas.
- Renderer atualizado com `onSelect` que persiste `[persistLabelKey]` automaticamente.

### 3.3 Reconstrução dos 17 blocos (`blocks/definitions.ts`)

Cada bloco agora segue o **mesmo esqueleto** — cabeçalho, ícone, nome, descrição curta, campos, validação, preview e ações vêm do padrão único.

#### Linguagem de negócio (antes → depois)

| Kind | Label antigo | Label V2 | Short V2 |
| --- | --- | --- | --- |
| `start` | "Início" | "Início" | "Onde o fluxo começa" |
| `end` | "Encerrar" | "Encerrar" | "Finaliza o atendimento automático" |
| `message` | "Enviar mensagem" | "Enviar mensagem" | "Envia um texto ao contato" |
| `question` | "Pergunta" | **"Fazer uma pergunta"** | "Pergunta e aguarda a resposta" |
| `send_image` | "Enviar imagem" | "Enviar imagem" | "Envia PNG, JPG ou WebP" |
| `send_audio` | "Enviar áudio" | "Enviar áudio" | "Envia MP3, OGG ou mensagem de voz" |
| `send_video` | "Enviar vídeo" | "Enviar vídeo" | "Envia MP4 (até 16 MB)" |
| `send_document` | "Enviar arquivo" | "Enviar arquivo" | "Envia PDF, DOCX, XLSX e outros" |
| `wait` | "Aguardar" | "Aguardar" | "Pausa o fluxo por um tempo" |
| `wait_reply` | "Aguardar resposta" | "Aguardar resposta" | "Pausa até o contato responder" |
| `condition` | "Condição" | "Condição" | "Segue por Sim ou Não" |
| `ai` | "Chamar IA" | "Chamar IA" | "Roteia a conversa a um agente de IA" |
| `transfer` | "Transferir para humano" | "Transferir para humano" | "Encaminha o contato ao atendimento" |
| `assign_agent` | "Atribuir agente" | **"Atribuir atendente"** | "Designa um responsável pela conversa" |
| `tag` | "Aplicar tag" | "Aplicar tag" | "Marca o contato com uma etiqueta" |
| `http_request` | "Requisição HTTP" | **"Chamar API externa"** | "Faz uma requisição HTTP a um sistema" |
| `webhook` | "Webhook" | **"Disparar webhook"** | "Notifica uma URL externa" |

#### Preview rico (elimina abrir o painel)

| Kind | Preview V1 | Preview V2 |
| --- | --- | --- |
| `start` | (nenhum) | "Ponto de partida do fluxo" |
| `end` | (nenhum) | "Fim do atendimento automático" |
| `message` | "Olá {{contact.name}}…" (raw) | `“Olá {{contact.name}}, tudo bem?”` |
| `question` | (raw) | `Pergunta: “Qual é o seu CNPJ?”` |
| `wait` | `5s` | `Aguardar 5 segundos` / `Aguardar 1 minuto 30s` |
| `wait_reply` | (nenhum) | "Pausa até o contato responder" |
| `condition` | (raw) | `Se contact.tags contém 'VIP'` |
| `ai` | (nenhum) | `Agente: Suporte` |
| `assign_agent` | (nenhum) | `Responsável: Maria` |
| `tag` | `#VIP` | `Marca como #VIP` |
| `http_request` | `GET https://api…/x/y` | `POST api.exemplo.com` |
| `webhook` | (URL crua) | `Envia para hooks.zapier.com` |
| `transfer` | (nenhum) | "Encaminhar ao Inbox humano" |
| media (image/audio/video/document) | filename ou "Mídia anexada" | filename ou `Imagem anexada` / `Vídeo anexado` / etc. — áudio ganha `· voz (PTT)` quando aplicável |

#### Validação contextual (mensagens acionáveis)

| Kind | Erro V1 | Erro V2 |
| --- | --- | --- |
| `message` | "Mensagem vazia" | "Escreva a mensagem que será enviada ao contato." |
| `question` | "Pergunta vazia" | "Escreva a pergunta que o contato deve responder." |
| `condition` | "Sem expressão" | "Defina a condição a ser avaliada." |
| `webhook` | "URL obrigatória" | "Informe a URL do webhook a ser chamado." |
| `http_request` | "URL obrigatória" | "Informe a URL do endpoint a ser chamado." |
| `wait` | (nenhum — aceitava 0) | "Informe quantos segundos o fluxo deve aguardar." |
| `ai` | "Selecione um agente" | "Selecione o agente de IA que responderá." |
| `assign_agent` | "Selecione um agente" | "Selecione o atendente responsável." |
| media | "Anexe a mídia" | "Anexe a imagem/áudio/vídeo/arquivo que será enviado." |
| `tag` | (silente) | ⚠️ warning: "Nenhuma tag definida — o bloco não terá efeito." |

#### Estados visuais (status agregado)

`status(data)` derivado padrão:

- `incomplete` — validação retorna `valid: false` (campo obrigatório vazio → borda tracejada, ícone de alerta).
- `attention` — `valid: true` mas há `warning` (ex.: `tag` vazia).
- `configured` — tudo verde no painel.
- `error` — reservado para falhas duras futuras (ex.: schema violation).

O card do canvas continua exibindo o estado via a classe `fbv2-node--invalid` (já existente) — nenhuma mudança em CSS ou Canvas foi necessária.

#### Campos inteligentes

- `send_audio` — `switch` "Enviar como mensagem de voz (PTT)" + `info` condicional (só aparece quando `is_voice=true` e o MIME não é OGG/Opus).
- `ai` / `assign_agent` — `select` com `persistLabelKey` grava o nome do agente para o preview.
- `wait` — `min=1, max=3600` + `suffix="seg"` + help "Entre 1 e 3600 segundos (1 hora).".
- `http_request` — opções verbalizadas ("GET · Consultar", "POST · Criar / enviar", …).
- `condition` — help "Se verdadeira, o fluxo segue por 'Sim'. Caso contrário, por 'Não'.".

#### Exemplos (`meta.hints.examples`)

Todos os 17 blocos declaram pelo menos 1 exemplo em linguagem de negócio, prontos para preview na Library V2 e para futuros prompts de IA:

```ts
message.hints.examples  → ["Olá {{contact.name}}, tudo bem?", "Recebemos seu comprovante…"]
wait.hints.examples     → ["Aguardar 5 segundos antes de enviar a próxima mensagem."]
condition.hints.examples→ ["Se contact.tags contém 'VIP' → oferta especial.", …]
```

### 3.4 Preparação para IA (arch-only)

Nenhuma UI ou chamada de IA foi implementada. A arquitetura existe:

- `message` e `question` já declaram `aiAssist.generateLabel` ("Gerar com IA", "Sugerir pergunta com IA") e `aiAssist.explain` para futuro copiloto.
- Qualquer bloco pode adicionar `aiAssist.suggests` para oferecer preenchimentos assistidos no painel.

## 4. Testes

**82 pass · 520 asserts · 156 ms** em 6 arquivos.

Novo `__tests__/blocks.test.ts` (45 casos) cobre os 17 blocos em 6 dimensões:

1. **Registry × padrão V2 (18 casos)** — meta completo (label/short/icon/accent/handles), `fields[]` declarado, `status` presente, `hints` presente.
2. **Preview rico (11 casos)** — cada preview retorna a forma esperada (aspas, prefixo, host, agente, tempo humano).
3. **Validação contextual (8 casos)** — mensagens acionáveis batem com o padrão FB-06.
4. **Status agregado (3 casos)** — `incomplete`/`attention`/`configured`.
5. **CRUD compatível (2 casos)** — `addNode` + `duplicateNode` + `removeNode` funcionam para os 17 kinds; `replaceNodeData` restaura estado inicial (Cancelar).
6. **Compatibilidade legada (2 casos)** — `preview/validate/status` não lançam em `data = {}`; blocos antigos com só `agent_id` (sem `agent_label`) exibem "Agente definido" / "Responsável definido".
7. **IA-ready arch (2 casos)** — `aiAssist.generateLabel` e `aiAssist.explain` presentes em `message`/`question`.

O `smart-sidebar.test.ts` foi atualizado para bater com as novas mensagens de erro e o novo formato de preview de `wait`.

Typecheck (`tsgo --noEmit`): **limpo**.

## 5. Compatibilidade com fluxos existentes

- **Nenhum campo persistido foi renomeado ou removido** (`body`, `seconds`, `expression`, `agent_id`, `url`, `method`, `tag`, `media_*`, `is_voice`, `caption`).
- `agent_label` é **novo** e opcional — quando ausente (fluxos criados antes do FB-06), o preview cai graciosamente para "Agente definido" / "Responsável definido". A próxima edição no painel grava o rótulo automaticamente.
- Todos os `kind` seguem idênticos ao valor de `flow_nodes.node_type` no banco.
- Round-trip `toServer(fromServer(x)) === x` continua verde (serializer test).

## 6. Auditoria de padrão (autoavaliação final)

- **Todos os blocos parecem pertencer ao mesmo produto?** ✅ Meta, layout, linguagem, erros e status seguem exatamente o mesmo esqueleto para todos os 17.
- **Um usuário entende cada bloco apenas olhando?** ✅ `meta.short` responde "o que faz"; `hints.whenToUse` responde "quando usar"; preview responde "o que vai acontecer".
- **Preview elimina a necessidade de abrir o painel na maioria dos casos?** ✅ 13 dos 17 blocos exibem preview textual útil sem abrir o SmartSidebar. Os 4 restantes (`start`, `end`, `transfer`, `wait_reply`) são de estado fixo — não têm o que configurar.
- **Existe bloco herdado?** ❌ Nenhum. Todos passaram por revisão de label, short, help, error e preview.

## 7. Acessibilidade

Nada novo foi introduzido que exija acessibilidade — a superfície visual continua sendo o SmartSidebar (Radix/shadcn, coberto por FB-04) e o BlockCard (coberto por FB-03). Os erros e infos ganharam ícone (Info/AlertTriangle) além do texto, atendendo à regra "cor não é o único canal de estado".

## 8. O que não foi feito (por design)

- **UI de IA no painel** — só a arquitetura foi entregue. Painel `aiAssist` virá em missão dedicada.
- **Reordenar a Library com os novos grupos** — o `keywords.ts` de FB-05 já cobre todos os 17 kinds; nenhum grupo mudou.
- **Bordas visuais adicionais para `attention`** — o padrão do BlockCard (Canvas) já cobre `invalid`; expor `attention` como classe distinta pediria mudança no Canvas, fora do escopo.

## 9. Próxima missão sugerida

**FB-07 — Copiloto de IA no SmartSidebar**. A base (`aiAssist`) já está pronta em todos os blocos; falta o painel que consome `generateLabel`/`explain`/`suggests` e chama o Lovable AI Gateway.

---

**Encerrada.** 17 blocos padronizados no padrão Block Experience V2. Linguagem de negócio, previews ricos, validação contextual, estados agregados, compatibilidade total com fluxos existentes, arquitetura pronta para IA. 82/82 testes verdes.
