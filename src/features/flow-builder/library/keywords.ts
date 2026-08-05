/**
 * FB-05 — Metadados extra por bloco para a Node Library V2.
 *
 * Cada bloco ganha:
 *  - `group`   — categoria orientada ao objetivo (não ao tipo técnico)
 *  - `aliases` — sinônimos que devem casar na busca
 *  - `keywords`— palavras-chave adicionais (ações, jargões)
 *  - `examples`— casos de uso curtos exibidos na pré-visualização
 *
 * Regras da missão:
 *  - NÃO altera `blocks/definitions.ts`. Este arquivo apenas *decora* o
 *    Registry — se um `kind` novo for registrado sem entrada aqui, ele
 *    ainda aparece na biblioteca (com defaults derivados do meta).
 *  - Grupos são strings puras: novos blocos podem inaugurar grupos novos
 *    sem qualquer alteração no restante do código.
 */

/** Categorias que aparecem na biblioteca (orientadas ao objetivo do operador). */
export const LIBRARY_GROUPS = [
  "Comunicação",
  "Arquivos",
  "Lógica",
  "Tempo",
  "IA",
  "Atendimento",
  "CRM",
  "Integrações",
  "Controle",
] as const;

export type LibraryGroup = (typeof LIBRARY_GROUPS)[number];

export interface BlockKeywords {
  group: LibraryGroup;
  aliases: string[];
  keywords: string[];
  examples: string[];
}

export const BLOCK_KEYWORDS: Record<string, BlockKeywords> = {
  start: {
    group: "Controle",
    aliases: ["início", "start", "entrada", "gatilho", "trigger"],
    keywords: ["ponto de partida", "começo", "iniciar"],
    examples: ["Início do fluxo — não pode ser removido."],
  },
  end: {
    group: "Controle",
    aliases: ["fim", "encerrar", "parar", "stop", "finalizar"],
    keywords: ["encerra a execução", "termina o fluxo"],
    examples: ["Encerra o fluxo após uma mensagem final."],
  },

  message: {
    group: "Comunicação",
    aliases: ["mensagem", "texto", "enviar", "resposta", "reply", "send text"],
    keywords: ["saudação", "confirmação", "aviso", "boas-vindas"],
    examples: [
      "Enviar: Olá {{contact.name}}, tudo bem?",
      "Confirmar recebimento de um documento.",
    ],
  },
  question: {
    group: "Comunicação",
    aliases: ["pergunta", "perguntar", "coletar", "ask", "input", "capturar"],
    keywords: ["formulário", "resposta", "coleta de dado", "capturar cnpj"],
    examples: [
      "Qual é o seu CNPJ?",
      "Qual é o melhor horário para retornar?",
    ],
  },

  send_image: {
    group: "Arquivos",
    aliases: ["imagem", "foto", "picture", "png", "jpg", "banner"],
    keywords: ["catálogo", "print", "logo", "produto"],
    examples: ["Enviar catálogo em PNG.", "Enviar comprovante em JPG."],
  },
  send_audio: {
    group: "Arquivos",
    aliases: ["áudio", "audio", "voz", "ptt", "voice", "ogg"],
    keywords: ["mensagem de voz", "gravação", "podcast"],
    examples: ["Enviar áudio de boas-vindas.", "PTT com instruções."],
  },
  send_video: {
    group: "Arquivos",
    aliases: ["vídeo", "video", "mp4", "clip"],
    keywords: ["tutorial", "demonstração", "vsl"],
    examples: ["Enviar vídeo demonstrativo do produto."],
  },
  send_document: {
    group: "Arquivos",
    aliases: ["arquivo", "documento", "pdf", "docx", "xlsx", "anexo", "file"],
    keywords: ["contrato", "boleto", "proposta", "planilha"],
    examples: ["Enviar contrato em PDF.", "Enviar planilha de preços."],
  },

  wait: {
    group: "Tempo",
    aliases: ["aguardar", "esperar", "delay", "sleep", "pausa", "temporizador"],
    keywords: ["intervalo", "espera fixa", "segundos"],
    examples: ["Aguardar 5s antes de enviar a próxima mensagem."],
  },
  wait_reply: {
    group: "Tempo",
    aliases: ["aguardar resposta", "wait reply", "pausar", "esperar cliente"],
    keywords: ["retomar quando responder", "pausa até input"],
    examples: ["Pausar até o cliente responder para continuar."],
  },

  condition: {
    group: "Lógica",
    aliases: ["condição", "condicional", "if", "sim/não", "regra", "branch"],
    keywords: ["expressão", "verdadeiro", "falso", "roteamento"],
    examples: [
      "Se contact.tags contém 'VIP' → enviar oferta especial.",
      "Se ai.output = 'sim' → continuar.",
    ],
  },

  ai: {
    group: "IA",
    aliases: ["ia", "ai", "agente", "chatgpt", "gpt", "llm", "assistente"],
    keywords: ["responder com IA", "classificar", "extrair dados", "resposta automática"],
    examples: [
      "Rotear a conversa ao Agente de Suporte.",
      "Classificar intenção do cliente com IA.",
    ],
  },

  transfer: {
    group: "Atendimento",
    aliases: ["transferir", "humano", "atendente", "handoff"],
    keywords: ["sair da automação", "encaminhar para atendimento"],
    examples: ["Transferir para atendimento humano no Inbox."],
  },
  assign_agent: {
    group: "Atendimento",
    aliases: ["atribuir", "assign", "designar", "responsável", "owner"],
    keywords: ["atendente", "operador", "responsável pela conversa"],
    examples: ["Atribuir a conversa ao operador Maria."],
  },

  tag: {
    group: "CRM",
    aliases: ["tag", "etiqueta", "marcar", "rótulo", "label"],
    keywords: ["VIP", "quente", "segmentar", "categorizar"],
    examples: ["Marcar contato como 'VIP' após confirmar compra."],
  },

  http_request: {
    group: "Integrações",
    aliases: ["http", "api", "request", "requisição", "endpoint", "rest"],
    keywords: ["GET", "POST", "PUT", "DELETE", "integração", "REST"],
    examples: ["POST https://api.exemplo.com/leads com dados do contato."],
  },
  webhook: {
    group: "Integrações",
    aliases: ["webhook", "callback", "notificar url", "hook"],
    keywords: ["disparar url", "notificação externa"],
    examples: ["Disparar webhook para o Zapier ao concluir o fluxo."],
  },
};

/** Devolve os metadados de biblioteca; usa defaults quando o bloco novo
 *  ainda não foi decorado — a biblioteca continua funcional. */
export function keywordsFor(kind: string): BlockKeywords {
  const found = BLOCK_KEYWORDS[kind];
  if (found) return found;
  return {
    group: "Controle",
    aliases: [],
    keywords: [],
    examples: [],
  };
}
