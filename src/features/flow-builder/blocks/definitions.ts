/**
 * FB-06 — Reconstrução dos 17 blocos no padrão Block Experience V2.
 *
 * Todos os blocos seguem o mesmo contrato:
 *   meta { label, short, icon, accent, handles, defaults, hints }
 *   fields[]  · preview()  · validate()  · status()  · aiAssist? (arch)
 *
 * Filosofia (o operador deve responder em <3s):
 *   1. O que este bloco faz?          → meta.short + meta.hints.whenToUse
 *   2. Como configurá-lo?             → fields[] no SmartSidebar
 *   3. O que acontecerá ao executar?  → preview() renderizado no card
 *
 * Regras respeitadas:
 *   - `kind` == `flow_nodes.node_type` (zero migração de banco);
 *   - Nenhuma alteração em Runtime, Executor, Canvas, SmartSidebar ou
 *     Store — só a *definição* dos blocos foi refeita;
 *   - Linguagem 100% de negócio (nada de "handle", "expression", "payload");
 *   - Mensagens de erro acionáveis ("Escreva a mensagem que…") no lugar
 *     de "Campo inválido";
 *   - `aiAssist` está presente como arquitetura pronta — nenhum consumidor
 *     hoje, mas qualquer bloco novo nasce AI-ready.
 */
import {
  Bot,
  Clock,
  FileAudio,
  FileText,
  FileVideo,
  GitBranch,
  Globe,
  Image as ImageIcon,
  ListChecks,
  ListTree,
  MessageSquare,
  Play,
  Shuffle,
  StopCircle,
  Tag,
  UserPlus,
  Users,
  Wand2,
  Webhook,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { blockRegistry } from "./registry";
import type {
  BlockAIAssist,
  BlockCategory,
  BlockDefinition,
  BlockHandles,
  BlockStatus,
  ValidationResult,
} from "./types";
import type { FieldSpec } from "../fields/types";

// ------------------------------------------------------------------
// Helpers de validação — mensagens acionáveis padrão
// ------------------------------------------------------------------
const ok = (): ValidationResult => ({ valid: true, issues: [] });
const err = (path: string, message: string): ValidationResult => ({
  valid: false,
  issues: [{ severity: "error", path, message }],
});
const warn = (path: string, message: string): ValidationResult => ({
  valid: true,
  issues: [{ severity: "warning", path, message }],
});
const s = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;
const n = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** V1.2 · Rótulos humanos dos modos operacionais do bloco Transferência de Número.
 *  Mantido como fonte única para preview, timeline e telemetria. */
export const TRANSFER_MODE_LABEL: Record<string, string> = {
  channel_only: "somente altera canal",
  channel_message: "canal + mensagem",
  channel_flow: "canal + fluxo",
  channel_agent: "canal + agente IA",
  channel_message_flow: "canal + mensagem + fluxo",
  channel_message_agent: "canal + mensagem + agente IA",
};

/** Formata segundos em linguagem humana (5s → "5 segundos", 90 → "1min 30s"). */
function humanSeconds(sec: number): string {
  if (sec < 60) return `${sec} segundo${sec === 1 ? "" : "s"}`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  const mm = `${m} minuto${m === 1 ? "" : "s"}`;
  return r === 0 ? mm : `${mm} ${r}s`;
}

/** Extrai host de uma URL — falha graciosamente. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//i, "").split("/")[0] || url;
  }
}

/** Trunca com reticências preservando início da frase. */
const clip = (t: string, max = 90): string =>
  t.length > max ? `${t.slice(0, max - 1)}…` : t;

const VARS_HELP =
  "Variáveis disponíveis: {{contact.name}}, {{ai.output}}, {{last_reply}}";

// ------------------------------------------------------------------
// Interface de registro (mesma forma consumida por ensureLegacyBlocksRegistered)
// ------------------------------------------------------------------
interface BlockSpec {
  kind: string;
  label: string;
  short: string;
  icon: LucideIcon;
  accent: string;
  category: BlockCategory;
  handles: BlockHandles;
  defaults?: Record<string, unknown>;
  hints?: BlockDefinition["meta"]["hints"];
  preview?: (data: Record<string, unknown>) => string | null;
  validate?: (data: Record<string, unknown>) => ValidationResult;
  status?: (data: Record<string, unknown>) => BlockStatus;
  fields?: FieldSpec[];
  aiAssist?: BlockAIAssist<Record<string, unknown>>;
  /** FB-10.4 — handles derivados dos dados da instância. */
  getHandles?: (data: Record<string, unknown>) => BlockHandles;
}

// ------------------------------------------------------------------
// Blocos — padrão V2
// ------------------------------------------------------------------
const BLOCKS: BlockSpec[] = [
  // ============ CONTROLE ============
  {
    kind: "start",
    label: "Início",
    short: "Onde o fluxo começa",
    icon: Play,
    accent: "oklch(0.72 0.14 240)",
    category: "system",
    handles: { in: 0, out: [{ id: "default" }] },
    defaults: { label: "Início" },
    hints: {
      whenToUse: "Todo fluxo começa aqui. Não pode ser removido nem duplicado.",
      examples: ["Ponto de partida do fluxo."],
    },
    preview: () => "Ponto de partida do fluxo",
    fields: [
      {
        type: "info",
        text:
          "Este é o ponto de partida. Conecte-o ao primeiro bloco que o contato deve receber ao iniciar a conversa.",
      },
    ],
  },
  {
    kind: "end",
    label: "Encerrar",
    short: "Finaliza o atendimento automático",
    icon: StopCircle,
    accent: "oklch(0.6 0.02 250)",
    category: "system",
    handles: { in: 1, out: [] },
    defaults: { label: "Encerrar" },
    hints: {
      whenToUse: "Use para marcar explicitamente o fim do atendimento automático.",
      examples: ["Encerra após enviar mensagem de despedida."],
    },
    preview: () => "Fim do atendimento automático",
    fields: [
      {
        type: "info",
        text:
          "A execução termina neste bloco. Se você não conectar nada depois, o contato continua livre para escrever a qualquer momento.",
      },
    ],
  },

  // ============ COMUNICAÇÃO ============
  {
    kind: "message",
    label: "Enviar mensagem",
    short: "Envia um texto ao contato",
    icon: MessageSquare,
    accent: "oklch(0.72 0.16 160)",
    category: "channels",
    handles: { in: 1, out: [{ id: "default" }] },
    defaults: { label: "Enviar mensagem", body: "" },
    hints: {
      whenToUse:
        "Envie saudações, avisos, confirmações e qualquer texto simples para o contato.",
      examples: [
        "Olá {{contact.name}}, tudo bem?",
        "Recebemos seu comprovante, muito obrigado!",
      ],
    },
    preview: (d) => {
      if (Array.isArray(d.actions) && d.actions.length > 0) {
        return `${d.actions.length} funções empilhadas`;
      }
      return s(d.body) ? `“${clip(String(d.body).trim())}”` : null;
    },
    validate: (d) => {
      if (Array.isArray(d.actions) && d.actions.length > 0) return ok();
      if (Array.isArray(d.items) && d.items.length > 0) return ok();
      const text = s(d.body) || s(d.text) || s(d.message);
      return text ? ok() : err("body", "Escreva a mensagem que será enviada ao contato.");
    },
    fields: [
      {
        type: "content_builder",
      },
    ],
    getHandles: (d) => {
      const buttons = Array.isArray(d.buttons) ? d.buttons : [];
      if (buttons.length > 0) {
        return {
          in: 1,
          out: buttons.map((b) => ({
            id: `btn_${(b as { id: string }).id}`,
            label: (b as { label: string }).label || "Botão",
          })),
        };
      }
      return { in: 1, out: [{ id: "default" }] };
    },
    aiAssist: {
      generateLabel: "Gerar com IA",
      explain: (d) =>
        s(d.body) ? `Envia: "${clip(String(d.body), 60)}"` : "Envia uma mensagem de texto ao contato.",
    },
  },
  {
    kind: "question",
    label: "Fazer uma pergunta",
    short: "Pergunta e aguarda a resposta",
    icon: ListChecks,
    accent: "oklch(0.74 0.16 140)",
    category: "channels",
    handles: {
      in: 1,
      out: [
        { id: "default", label: "após resposta" },
        { id: "no_reply", label: "se não responder" },
      ],
    },
    defaults: {
      label: "Fazer uma pergunta",
      body: "",
      save_as: "resposta",
      timeout_value: 1,
      timeout_unit: "days",
    },
    hints: {
      whenToUse:
        "Faça uma pergunta e o fluxo pausa até o contato responder. Se ele não responder no tempo configurado, o fluxo segue pela saída “se não responder”.",
      examples: ["Qual é o seu CNPJ?", "Qual o melhor horário para retornar?"],
    },
    preview: (d) => (s(d.body) ? `Pergunta: “${clip(String(d.body).trim(), 70)}”` : null),
    validate: (d) =>
      s(d.body) ? ok() : err("body", "Escreva a pergunta que o contato deve responder."),
    fields: [
      {
        type: "textarea",
        key: "body",
        label: "Pergunta",
        placeholder: "Ex: Qual é o seu CNPJ?",
        rows: 4,
        required: true,
        help: "A resposta ficará disponível como {{last_reply}} nos blocos seguintes.",
      },
      {
        type: "text",
        key: "save_as",
        label: "Salvar resposta em",
        placeholder: "resposta",
        help: "Nome da variável onde a resposta será guardada (use {{resposta}}).",
      },
      {
        type: "duration",
        key: "timeout_value",
        unitKey: "timeout_unit",
        label: "Se usuário não responder · entrada expira em",
        min: 1,
        clearable: true,
        help: "Deixe em branco para aguardar indefinidamente.",
      },
    ],

    aiAssist: {
      generateLabel: "Sugerir pergunta com IA",
    },
  },

  // ============ MENU ============
  {
    kind: "menu",
    label: "Menu de opções",
    short: "Ofereça uma lista numerada ao contato",
    icon: ListTree,
    accent: "oklch(0.72 0.15 190)",
    category: "channels",
    handles: {
      in: 1,
      out: [
        { id: "invalid", label: "inválido" },
      ],
    },
    defaults: {
      label: "Menu de opções",
      body: "",
      options: [],
      max_attempts: 2,
      invalid_message: "Não entendi. Por favor, responda com o número de uma das opções.",
    },
    hints: {
      whenToUse:
        "Ofereça um menu numerado ao contato e siga por caminhos diferentes conforme a escolha.",
      examples: [
        "1) Falar com atendimento  2) Segunda via de boleto  3) Cancelamento",
      ],
    },
    preview: (d) => {
      const opts = Array.isArray(d.options) ? (d.options as Array<{ label?: string }>) : [];
      const first = opts
        .map((o) => (typeof o?.label === "string" ? o.label.trim() : ""))
        .filter(Boolean);
      if (first.length === 0) return s(d.body) ? clip(String(d.body).trim(), 60) : null;
      const shown = first.slice(0, 3).map((l, i) => `${i + 1}) ${clip(l, 22)}`).join(" · ");
      const rest = first.length > 3 ? ` · +${first.length - 3}` : "";
      return `${shown}${rest}`;
    },
    validate: (d) => {
      if (!s(d.body)) return err("body", "Escreva a pergunta que abrirá o menu.");
      const opts = Array.isArray(d.options) ? (d.options as Array<{ id?: unknown; label?: unknown }>) : [];
      const valid = opts.filter((o) => typeof o?.label === "string" && (o.label as string).trim());
      if (valid.length < 2) return err("options", "Adicione pelo menos duas opções.");
      const labels = valid.map((o) => (o.label as string).trim().toLowerCase());
      if (new Set(labels).size !== labels.length) {
        return err("options", "As opções não podem se repetir.");
      }
      const ids = valid.map((o) => (typeof o.id === "string" ? o.id : ""));
      if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
        return err("options", "Cada opção precisa de um identificador único.");
      }
      return ok();
    },
    fields: [
      {
        type: "textarea",
        key: "body",
        label: "Pergunta do menu",
        placeholder: "Ex: Como podemos te ajudar hoje?",
        rows: 3,
        required: true,
        help: "Este texto é enviado antes da lista numerada de opções.",
      },
      {
        type: "menu_options",
        key: "options",
        label: "Opções",
        min: 2,
        max: 10,
      },
      {
        type: "number",
        key: "max_attempts",
        label: "Tentativas antes de sair pelo caminho 'inválido'",
        min: 1,
        max: 5,
        step: 1,
        suffix: "tent.",
        help: "Depois desse número de respostas não reconhecidas, o fluxo segue pelo caminho 'inválido'.",
      },
      {
        type: "text",
        key: "invalid_message",
        label: "Mensagem de resposta inválida",
        placeholder: "Não entendi. Escolha uma das opções.",
        help: "Enviada quando o contato responde algo fora da lista, dentro do limite de tentativas.",
      },
      {
        type: "info",
        text:
          "Cada opção vira uma saída no bloco. Conecte cada saída ao próximo passo do fluxo — a saída 'inválido' cobre quando o contato não responde uma opção válida a tempo.",
      },
    ],
    getHandles: (d) => {
      const opts = Array.isArray(d.options) ? (d.options as Array<{ id?: unknown; label?: unknown }>) : [];
      const valid = opts
        .map((o) => ({
          id: typeof o?.id === "string" ? o.id : "",
          label: typeof o?.label === "string" ? o.label.trim() : "",
        }))
        .filter((o) => o.id && o.label);
      return {
        in: 1,
        out: [
          ...valid.map((o, i) => ({ id: o.id, label: `${i + 1}. ${clip(o.label, 24)}` })),
          { id: "invalid", label: "inválido" },
        ],
      };
    },
  },

  // ============ ARQUIVOS ============
  {
    kind: "send_image",
    label: "Enviar imagem",
    short: "Envia PNG, JPG ou WebP",
    icon: ImageIcon,
    accent: "oklch(0.72 0.18 200)",
    category: "channels",
    handles: { in: 1, out: [{ id: "default" }] },
    defaults: { label: "Enviar imagem" },
    hints: {
      whenToUse: "Envie fotos de produtos, catálogos, comprovantes ou banners.",
      examples: ["Enviar catálogo em PNG.", "Enviar comprovante de pagamento."],
    },
    preview: mediaPreview("imagem"),
    validate: (d) =>
      s(d.media_url) ? ok() : err("media_url", "Anexe a imagem que será enviada."),
    fields: [{ type: "media", mediaKind: "image", withCaption: true }],
  },
  {
    kind: "send_audio",
    label: "Enviar áudio",
    short: "Envia MP3, OGG ou mensagem de voz",
    icon: FileAudio,
    accent: "oklch(0.7 0.18 300)",
    category: "channels",
    handles: { in: 1, out: [{ id: "default" }] },
    defaults: { label: "Enviar áudio" },
    hints: {
      whenToUse:
        "Envie áudios comuns ou mensagens de voz (PTT) — para PTT ideal, use OGG/Opus.",
      examples: ["Áudio de boas-vindas.", "Mensagem de voz com instruções."],
    },
    preview: (d) => {
      const base = mediaPreview("áudio")(d);
      if (!base) return null;
      return d.is_voice ? `${base} · voz (PTT)` : base;
    },
    validate: (d) =>
      s(d.media_url) ? ok() : err("media_url", "Anexe o arquivo de áudio que será enviado."),
    fields: [
      { type: "media", mediaKind: "audio" },
      {
        type: "switch",
        key: "is_voice",
        label: "Enviar como mensagem de voz (PTT)",
        description: "O contato recebe como um áudio de WhatsApp Voice.",
      },
      {
        type: "info",
        variant: "warning",
        text:
          "Para melhor compatibilidade em mensagens de voz, envie um arquivo OGG/Opus. Outros formatos podem chegar como áudio comum em alguns aparelhos.",
        visible: (d) => {
          if (!d.is_voice) return false;
          const mime = typeof d.media_mime === "string" ? d.media_mime : "";
          return !!mime && !/ogg|opus/i.test(mime);
        },
      },
    ],
  },
  {
    kind: "send_video",
    label: "Enviar vídeo",
    short: "Envia MP4 (até 16 MB)",
    icon: FileVideo,
    accent: "oklch(0.68 0.2 20)",
    category: "channels",
    handles: { in: 1, out: [{ id: "default" }] },
    defaults: { label: "Enviar vídeo" },
    hints: {
      whenToUse: "Envie tutoriais, demonstrações e vídeos de venda.",
      examples: ["Vídeo demonstrativo do produto.", "Tutorial de ativação."],
    },
    preview: mediaPreview("vídeo"),
    validate: (d) =>
      s(d.media_url) ? ok() : err("media_url", "Anexe o vídeo que será enviado."),
    fields: [{ type: "media", mediaKind: "video", withCaption: true }],
  },
  {
    kind: "send_document",
    label: "Enviar arquivo",
    short: "Envia PDF, DOCX, XLSX e outros",
    icon: FileText,
    accent: "oklch(0.72 0.14 60)",
    category: "channels",
    handles: { in: 1, out: [{ id: "default" }] },
    defaults: { label: "Enviar arquivo" },
    hints: {
      whenToUse: "Envie contratos, boletos, propostas, planilhas e outros documentos.",
      examples: ["Contrato em PDF.", "Planilha de preços em XLSX."],
    },
    preview: mediaPreview("arquivo"),
    validate: (d) =>
      s(d.media_url) ? ok() : err("media_url", "Anexe o arquivo que será enviado."),
    fields: [{ type: "media", mediaKind: "document", withCaption: true }],
  },

  // ============ TEMPO ============
  {
    kind: "wait",
    label: "Aguardar",
    short: "Pausa o fluxo por um tempo",
    icon: Clock,
    accent: "oklch(0.76 0.1 200)",
    category: "logic",
    handles: { in: 1, out: [{ id: "default" }] },
    defaults: { label: "Aguardar", seconds: 5 },
    hints: {
      whenToUse:
        "Insira uma pausa entre mensagens para dar ritmo natural à conversa.",
      examples: ["Aguardar 5 segundos antes de continuar.", "Aguardar 2 minutos."],
    },
    preview: (d) => {
      const sec = n(d.seconds);
      if (sec === null || sec <= 0) return null;
      return `Aguardar ${humanSeconds(sec)}${d.is_typing ? " (digitando...)" : ""}`;
    },
    validate: (d) => {
      const sec = n(d.seconds);
      if (sec === null || sec <= 0) return err("seconds", "Informe quantos segundos o fluxo deve aguardar.");
      return ok();
    },
    fields: [
      {
        type: "number",
        key: "seconds",
        label: "Tempo de espera",
        min: 1,
        max: 3600,
        suffix: "seg",
        required: true,
        help: "Entre 1 e 3600 segundos (1 hora).",
      },
      {
        type: "switch",
        key: "is_typing",
        label: 'Simular "digitando..."',
        description: "Exibe status de digitação no WhatsApp durante a espera.",
      },
    ],
  },
  {
    kind: "wait_reply",
    label: "Aguardar resposta",
    short: "Esperar resposta sem tempo definido",
    icon: Clock,
    accent: "oklch(0.76 0.1 220)",
    category: "logic",
    handles: { in: 1, out: [{ id: "default" }] },
    defaults: { label: "Aguardar resposta" },
    hints: {
      whenToUse:
        "Use quando o próximo passo depende da próxima mensagem do contato sem limite de tempo.",
      examples: ["Pausar até o cliente responder sem tempo definido."],
    },
    preview: () => "Esperar resposta sem tempo definido",
    fields: [
      {
        type: "info",
        text:
          "O fluxo pausa neste bloco sem tempo definido (sem limite de expiração). A próxima mensagem enviada pelo contato retoma a execução automaticamente.",
      },
    ],
  },

  // ============ LÓGICA ============
  {
    kind: "condition",
    label: "Condição",
    short: "Segue por Sim ou Não",
    icon: GitBranch,
    accent: "oklch(0.78 0.16 75)",
    category: "logic",
    handles: {
      in: 1,
      out: [
        { id: "true", label: "sim" },
        { id: "false", label: "não" },
      ],
    },
    defaults: {
      label: "Condição",
      field: "",
      operator: "equals",
      value: "",
      expression: "",
    },
    hints: {
      whenToUse:
        "Divida o fluxo com base em uma regra: se for verdadeira, segue por 'Sim'; caso contrário, por 'Não'.",
      examples: [
        "Se contact.tags contém 'VIP' → oferta especial.",
        "Se http.status é maior ou igual a 200 → seguir.",
      ],
    },
    preview: (d) => {
      if (Array.isArray(d.conditions) && d.conditions.length > 0) {
        return `Lógica ${d.logic === "ANY" ? "QUALQUER (OU)" : "TODAS (E)"} (${d.conditions.length} regras)`;
      }
      const field = s(d.field);
      const op = s(d.operator);
      if (field && op) {
        const opLabel = String(op);
        if (opLabel === "exists" || opLabel === "not_exists") return `Se ${field} ${opLabel === "exists" ? "existir" : "não existir"}`;
        const val = s(d.value);
        return `Se ${field} ${opLabel} ${val ?? "…"}`;
      }
      return s(d.expression) ? `Se ${clip(String(d.expression).trim(), 70)}` : null;
    },
    validate: (d) => {
      if (Array.isArray(d.conditions) && d.conditions.length > 0) return ok();
      const field = s(d.field);
      const op = s(d.operator);
      // Modo estruturado (FB-10.5).
      if (field || op) {
        if (!field) return err("field", "Informe qual campo/variável avaliar (ex: contact.name).");
        if (!op) return err("operator", "Escolha um operador.");
        const opStr = String(op);
        if (opStr !== "exists" && opStr !== "not_exists" && !s(d.value)) {
          return err("value", "Informe o valor de comparação.");
        }
        return ok();
      }
      // Modo legado — mantém compatibilidade.
      return s(d.expression) ? ok() : err("field", "Configure o campo, operador e valor da condição.");
    },
    fields: [
      {
        type: "condition_builder",
      },
    ],
  },


  // ============ IA ============
  {
    kind: "ai",
    label: "Assistente GPT",
    short: "Roteia a conversa a um agente de IA",
    icon: Bot,
    accent: "oklch(0.7 0.2 320)",
    category: "ai",
    handles: { in: 1, out: [{ id: "default" }] },
    defaults: { label: "Assistente GPT" },
    hints: {
      whenToUse:
        "Delegue a resposta a um agente de IA já configurado. A resposta fica disponível em {{ai.output}}.",
      examples: [
        "Rotear ao Agente de Suporte.",
        "Classificar a intenção do cliente antes de decidir o caminho.",
      ],
    },
    preview: (d) => (s(d.agent_label) ? `Agente: ${d.agent_label}` : s(d.agent_id) ? "Agente definido" : null),
    validate: (d) => {
      const hasConfig = s(d.agent_id) || s(d.assistantName) || s(d.instructions) || s(d.persona) || s(d.prompt);
      return hasConfig ? ok() : err("agent_id", "Selecione o agente de IA que responderá.");
    },
    fields: [
      {
        type: "select",
        key: "agent_id",
        label: "Agente de IA",
        required: true,
        placeholder: "Selecione um agente…",
        emptyMessage: "Nenhum agente cadastrado. Crie um em Agentes IA.",
        persistLabelKey: "agent_label",
        options: (ctx) =>
          ctx.agents.map((a) => ({
            value: a.id,
            label: a.name,
            hint: a.is_active ? undefined : "(inativo)",
          })),
      },
    ],
  },

  // ============ ATENDIMENTO ============
  {
    kind: "transfer",
    label: "Transferir para humano",
    short: "Encaminha o contato ao atendimento",
    icon: Users,
    accent: "oklch(0.68 0.22 25)",
    category: "crm",
    handles: { in: 1, out: [{ id: "default" }] },
    defaults: { label: "Transferir para humano" },
    hints: {
      whenToUse:
        "Encerra a automação e leva a conversa ao Inbox para um operador humano continuar.",
      examples: ["Encaminhar para atendimento humano após identificar objeção."],
    },
    preview: (d) => {
      const t = s(d.target_type) ?? "queue";
      if (t === "agent" && s(d.agent_label)) return `Transferir para: ${d.agent_label}`;
      if (t === "department" && s(d.department)) return `Transferir para Equipe: ${d.department}`;
      return "Transferir para Fila Geral (Inbox)";
    },
    fields: [
      {
        type: "radio",
        key: "target_type",
        label: "Modo de Atribuição",
        options: [
          { value: "queue", label: "Fila Geral (Inbox sem operador fixo)" },
          { value: "agent", label: "Atendente / Membro Específico" },
          { value: "department", label: "Equipe / Departamento" },
        ],
      },
      {
        type: "select",
        key: "agent_id",
        label: "Atendente responsável",
        placeholder: "Selecione um atendente…",
        emptyMessage: "Nenhum atendente cadastrado.",
        persistLabelKey: "agent_label",
        required: true,
        options: (ctx) =>
          (ctx.members && ctx.members.length > 0 ? ctx.members : ctx.agents).map((a) => ({
            value: a.id,
            label: a.name,
          })),
        visible: (d) => (s(d.target_type) ?? "queue") === "agent",
      },
      {
        type: "select",
        key: "department",
        label: "Equipe / Departamento",
        placeholder: "Selecione o departamento…",
        required: true,
        options: [
          { value: "Vendas", label: "💼 Vendas / Comercial" },
          { value: "Suporte", label: "🎧 Suporte Técnico" },
          { value: "Financeiro", label: "💰 Financeiro / Cobrança" },
          { value: "Atendimento", label: "💬 Atendimento Geral" },
        ],
        visible: (d) => (s(d.target_type) ?? "queue") === "department",
      },
      {
        type: "textarea",
        key: "transfer_message",
        label: "Nota / Instrução de Transferência (opcional)",
        placeholder: "Ex: Cliente qualificado no bot com interesse no plano PRO…",
        rows: 3,
        help: "Nota interna para o operador responsável no Inbox.",
      },
    ],
  },

  // ============ TRANSFERÊNCIA DE NÚMERO (V1.2) ============
  {
    kind: "transfer_number",
    label: "Transferência de número",
    short: "Muda o atendimento para outro WhatsApp da empresa",
    icon: Workflow,
    accent: "oklch(0.7 0.17 150)",
    category: "crm",
    handles: {
      in: 1,
      out: [
        { id: "success", label: "sucesso" },
        { id: "error", label: "erro" },
      ],
    },
    defaults: {
      label: "Transferência de número",
      transfer_mode: "channel_only",
      to_channel_id: "",
      initial_message: "",
      flow_id: "",
      agent_id: "",
    },
    hints: {
      whenToUse:
        "Encaminhe o mesmo cliente para outro canal WhatsApp da empresa (Comercial → Financeiro, por exemplo).",
      examples: [
        "Comercial → Financeiro após confirmar interesse.",
        "Suporte → Cobrança quando o assunto for pagamento.",
      ],
    },
    preview: (d) => {
      const to = s(d.to_channel_label);
      const modeLabel = TRANSFER_MODE_LABEL[s(d.transfer_mode) ?? "channel_only"] ?? null;
      const parts: string[] = [];
      if (to) parts.push(`→ ${to}`);
      if (modeLabel) parts.push(modeLabel);
      if (parts.length === 0 && s(d.to_channel_id)) return "Transferir para canal selecionado";
      return parts.length ? parts.join(" · ") : null;
    },
    validate: (d) => {
      if (!s(d.to_channel_id))
        return err("to_channel_id", "Escolha o canal WhatsApp de destino.");
      const mode = s(d.transfer_mode) ?? "channel_only";
      if ((mode === "channel_message" || mode === "channel_message_flow" || mode === "channel_message_agent") && !s(d.initial_message))
        return err("initial_message", "Informe a mensagem inicial para este modo.");
      if ((mode === "channel_flow" || mode === "channel_message_flow") && !s(d.flow_id))
        return err("flow_id", "Selecione o fluxo que será iniciado.");
      if ((mode === "channel_agent" || mode === "channel_message_agent") && !s(d.agent_id))
        return err("agent_id", "Selecione o agente IA que será acionado.");
      return ok();
    },
    fields: [
      {
        type: "info",
        text:
          "O contato permanece o mesmo e a conversa continua única. As próximas mensagens passam a sair pelo canal escolhido.",
      },
      {
        type: "select",
        key: "to_channel_id",
        label: "Canal WhatsApp de destino",
        required: true,
        placeholder: "Selecione um canal…",
        emptyMessage: "Nenhum outro canal disponível nesta empresa.",
        persistLabelKey: "to_channel_label",
        options: (ctx) =>
          (ctx.channels ?? []).map((c) => ({ value: c.id, label: c.name })),
      },
      {
        type: "radio",
        key: "transfer_mode",
        label: "Modo da transferência",
        required: true,
        options: [
          { value: "channel_only", label: "Somente alterar canal" },
          { value: "channel_message", label: "Alterar canal + enviar mensagem" },
          { value: "channel_flow", label: "Alterar canal + iniciar fluxo" },
          { value: "channel_agent", label: "Alterar canal + iniciar Agente IA" },
          { value: "channel_message_flow", label: "Alterar canal + enviar mensagem + iniciar fluxo" },
          { value: "channel_message_agent", label: "Alterar canal + enviar mensagem + iniciar Agente IA" },
        ],
      },
      {
        type: "textarea",
        key: "initial_message",
        label: "Mensagem inicial",
        placeholder: "Ex: Olá! Você agora está falando com o Financeiro.",
        rows: 3,
        required: true,
        help: "Enviada automaticamente pelo novo canal logo após a transferência.",
        visible: (d) => {
          const m = s(d.transfer_mode) ?? "channel_only";
          return m === "channel_message" || m === "channel_message_flow" || m === "channel_message_agent";
        },
      },
      {
        type: "select",
        key: "flow_id",
        label: "Fluxo a iniciar",
        placeholder: "Selecione um fluxo…",
        emptyMessage: "Nenhum outro fluxo disponível.",
        required: true,
        persistLabelKey: "flow_label",
        options: (ctx) =>
          (ctx.flows ?? [])
            .filter((f) => f.id !== ctx.flowId && f.status !== "archived")
            .map((f) => ({ value: f.id, label: f.name })),
        visible: (d) => {
          const m = s(d.transfer_mode) ?? "channel_only";
          return m === "channel_flow" || m === "channel_message_flow";
        },
      },
      {
        type: "select",
        key: "agent_id",
        label: "Agente IA a acionar",
        placeholder: "Selecione um agente…",
        emptyMessage: "Nenhum agente cadastrado.",
        required: true,
        persistLabelKey: "agent_label",
        options: (ctx) =>
          ctx.agents
            .filter((a) => a.is_active)
            .map((a) => ({ value: a.id, label: a.name })),
        visible: (d) => {
          const m = s(d.transfer_mode) ?? "channel_only";
          return m === "channel_agent" || m === "channel_message_agent";
        },
      },
    ],
    aiAssist: {
      explain: (d) => {
        const to = s(d.to_channel_label) ?? "outro canal";
        const modeLabel = TRANSFER_MODE_LABEL[s(d.transfer_mode) ?? "channel_only"] ?? "somente altera o canal";
        return `Transfere o atendimento para ${to} (${modeLabel}) preservando contato e conversa.`;
      },
    },
  },


  {
    kind: "assign_agent",
    label: "Atribuir atendente",
    short: "Designa um responsável pela conversa",
    icon: UserPlus,
    accent: "oklch(0.7 0.14 30)",
    category: "crm",
    handles: { in: 1, out: [{ id: "default" }] },
    defaults: { label: "Atribuir atendente" },
    hints: {
      whenToUse:
        "Registre quem é o responsável pela conversa — não interrompe o fluxo.",
      examples: ["Atribuir ao operador Maria após triagem."],
    },
    preview: (d) =>
      s(d.agent_label)
        ? `Responsável: ${d.agent_label}`
        : s(d.agent_id)
          ? "Responsável definido"
          : null,
    validate: (d) =>
      s(d.agent_id) ? ok() : err("agent_id", "Selecione o atendente responsável."),
    fields: [
      {
        type: "select",
        key: "agent_id",
        label: "Atendente responsável",
        required: true,
        placeholder: "Selecione um atendente…",
        emptyMessage: "Nenhum atendente disponível.",
        persistLabelKey: "agent_label",
        options: (ctx) =>
          ctx.agents.map((a) => ({ value: a.id, label: a.name })),
      },
    ],
  },

  // ============ CRM ============
  {
    kind: "tag",
    label: "Aplicar tag",
    short: "Marca o contato com uma etiqueta",
    icon: Tag,
    accent: "oklch(0.78 0.13 45)",
    category: "crm",
    handles: { in: 1, out: [{ id: "default" }] },
    defaults: { label: "Aplicar tag", tag: "" },
    hints: {
      whenToUse:
        "Categorize contatos para segmentação e relatórios (VIP, quente, retorno…).",
      examples: ["Marcar como 'VIP' após confirmar a compra."],
    },
    preview: (d) => (s(d.tag) ? `Marca como #${String(d.tag).trim()}` : null),
    validate: (d) => (s(d.tag) ? ok() : warn("tag", "Nenhuma tag definida — o bloco não terá efeito.")),
    fields: [
      {
        type: "text",
        key: "tag",
        label: "Nome da tag",
        placeholder: "Ex: VIP, quente, retorno",
        maxLength: 40,
        help: "Use nomes curtos e sem espaços para facilitar segmentações.",
      },
    ],
  },

  // ============ INTEGRAÇÕES ============
  {
    kind: "http_request",
    label: "Integração",
    short: "Faz uma requisição HTTP a um sistema",
    icon: Globe,
    accent: "oklch(0.7 0.14 260)",
    category: "integrations",
    handles: { in: 1, out: [{ id: "default" }] },
    defaults: {
      label: "Integração",
      method: "GET",
      url: "",
      headers: "",
      auth_type: "none",
      auth_token: "",
      body: "",
      timeout_ms: 10000,
      save_as: "http",
    },
    hints: {
      whenToUse:
        "Consulte ou envie dados a um sistema externo (CRM, ERP, planilha) no meio do fluxo.",
      examples: [
        "POST https://api.exemplo.com/leads com os dados do contato.",
        "GET https://api.exemplo.com/cliente/{{contact.id}} e usar em {{http.body}}.",
      ],
    },
    preview: (d) => {
      const url = s(d.url);
      if (!url) return null;
      const method = (typeof d.method === "string" && d.method) || "GET";
      return `${method} ${hostOf(url)}`;
    },
    validate: (d) => {
      const url = s(d.url);
      if (!url) return err("url", "Informe a URL do endpoint a ser chamado.");
      // Não impede publicação com {{...}}; só valida esquema em URLs literais.
      if (!/\{\{/.test(url)) {
        try {
          const u = new URL(url);
          if (u.protocol !== "http:" && u.protocol !== "https:") {
            return err("url", "URL precisa começar com http:// ou https://.");
          }
        } catch {
          return err("url", "URL inválida. Inclua o protocolo (https://).");
        }
      }
      const authType = typeof d.auth_type === "string" ? d.auth_type : "none";
      if (authType === "bearer" && !s(d.auth_token)) {
        return err("auth_token", "Informe o token de autenticação Bearer.");
      }
      return ok();
    },
    fields: [
      {
        type: "select",
        key: "method",
        label: "Método",
        options: [
          { value: "GET", label: "GET · Consultar" },
          { value: "POST", label: "POST · Criar / enviar" },
          { value: "PUT", label: "PUT · Atualizar" },
          { value: "DELETE", label: "DELETE · Remover" },
        ],
      },
      {
        type: "text",
        key: "url",
        label: "Endereço (URL)",
        placeholder: "https://api.exemplo.com/endpoint",
        mono: true,
        required: true,
        help: "Inclua o protocolo (https://). Aceita variáveis {{...}}.",
      },
      {
        type: "textarea",
        key: "headers",
        label: "Cabeçalhos (opcional)",
        placeholder: "X-Api-Key: chave\nAccept: application/json",
        rows: 3,
        help: "Um por linha no formato Chave: Valor. Aceita variáveis {{...}}.",
      },
      {
        type: "select",
        key: "auth_type",
        label: "Autenticação",
        options: [
          { value: "none", label: "Nenhuma" },
          { value: "bearer", label: "Bearer token" },
        ],
      },
      {
        type: "text",
        key: "auth_token",
        label: "Token Bearer",
        placeholder: "{{secrets.api_token}} ou o token literal",
        mono: true,
        help: "Enviado como Authorization: Bearer …. Aceita variáveis {{...}}.",
        visible: (d) => d.auth_type === "bearer",
      },
      {
        type: "textarea",
        key: "body",
        label: "Corpo (JSON)",
        placeholder: '{ "name": "{{contact.name}}" }',
        rows: 4,
        help: "Usado em POST/PUT/DELETE. Aceita variáveis {{...}}.",
        visible: (d) => {
          const m = typeof d.method === "string" ? d.method.toUpperCase() : "GET";
          return m !== "GET" && m !== "HEAD";
        },
      },
      {
        type: "number",
        key: "timeout_ms",
        label: "Tempo limite (ms)",
        min: 500,
        max: 30000,
        step: 500,
        suffix: "ms",
        help: "Padrão 10000ms. Máximo 30000ms.",
      },
      {
        type: "text",
        key: "save_as",
        label: "Salvar resposta em",
        placeholder: "http",
        mono: true,
        help: "Nome da variável (default: http). Depois use {{http.status}}, {{http.body}} etc.",
      },
      {
        type: "info",
        text:
          "Por segurança, endereços de rede privada (localhost, 10.x, 192.168.x, 169.254.x, 172.16-31.x) são bloqueados.",
      },
    ],
  },
  {
    kind: "webhook",
    label: "Disparar webhook",
    short: "Notifica uma URL externa",
    icon: Webhook,
    accent: "oklch(0.7 0.14 280)",
    category: "integrations",
    handles: { in: 1, out: [{ id: "default" }] },
    defaults: { label: "Disparar webhook", url: "" },
    hints: {
      whenToUse:
        "Envie um sinal a Zapier, Make ou outro sistema quando o fluxo passar por aqui.",
      examples: ["Disparar webhook para o Zapier ao concluir o cadastro."],
    },
    preview: (d) => (s(d.url) ? `Envia para ${hostOf(String(d.url))}` : null),
    validate: (d) =>
      s(d.url) ? ok() : err("url", "Informe a URL do webhook a ser chamado."),
    fields: [
      {
        type: "text",
        key: "url",
        label: "URL do webhook",
        placeholder: "https://hooks.exemplo.com/…",
        mono: true,
        required: true,
        help: "Inclua o protocolo (https://).",
      },
    ],
  },

  // ============ AÇÃO (FB-10.4B) ============
  {
    kind: "action",
    label: "Ação",
    short: "Execute uma ação automática no contato ou atendimento",
    icon: Wand2,
    accent: "oklch(0.72 0.16 30)",
    category: "crm",
    handles: { in: 1, out: [{ id: "default" }] },
    defaults: {
      label: "Ação",
      action_type: "",
    },
    hints: {
      whenToUse:
        "Aplique automações no CRM/atendimento: adicionar/remover etiquetas ou atribuir um atendente.",
      examples: [
        "Adicionar etiqueta 'Lead qualificado' após o contato responder.",
        "Atribuir a conversa a um atendente específico.",
      ],
    },
    preview: (d) => {
      const t = s(d.action_type);
      if (!t) return null;
      if (t === "add_tag") {
        const tag = s(d.tag_label);
        return tag ? `Adicionar etiqueta “${tag}”` : "Adicionar etiqueta";
      }
      if (t === "remove_tag") {
        const tag = s(d.tag_label);
        return tag ? `Remover etiqueta “${tag}”` : "Remover etiqueta";
      }
      if (t === "assign_agent") {
        const agent = s(d.agent_user_label);
        return agent ? `Atribuir atendente: ${agent}` : "Atribuir atendente";
      }
      if (t === "stevo_call") {
        return "Disparar chamada Stevo Voice";
      }
      return null;
    },
    validate: (d) => {
      if (Array.isArray(d.actions) && d.actions.length > 0) return ok();
      const t = s(d.action_type);
      if (!t) return err("action_type", "Escolha a ação que será executada.");
      if (t === "add_tag" || t === "remove_tag") {
        if (!s(d.tag_id) && !s(d.tag_name) && !s(d.tagName)) {
          const verb = t === "add_tag" ? "adicionada" : "removida";
          return err("tag_id", `Selecione a etiqueta que será ${verb}.`);
        }
      }
      if (t === "assign_agent") {
        if (!s(d.agent_user_id) && !s(d.memberName)) {
          return err("agent_user_id", "Selecione o atendente que receberá o contato.");
        }
      }
      return ok();
    },
    fields: [
      {
        type: "select",
        key: "action_type",
        label: "Qual ação executar?",
        required: true,
        placeholder: "Escolha uma ação…",
        options: [
          { value: "add_tag", label: "Adicionar etiqueta ao contato" },
          { value: "remove_tag", label: "Remover etiqueta do contato" },
          { value: "assign_agent", label: "Atribuir atendente à conversa" },
          { value: "stevo_call", label: "Disparar chamada Stevo Voice" },
        ],
        help: "Cada ação exibirá abaixo apenas os campos necessários.",
      },
      {
        type: "select",
        key: "tag_id",
        label: "Etiqueta",
        required: true,
        placeholder: "Selecione uma etiqueta…",
        emptyMessage: "Nenhuma etiqueta cadastrada. Crie em CRM › Etiquetas.",
        persistLabelKey: "tag_label",
        options: (ctx) => (ctx.tags ?? []).map((t) => ({ value: t.id, label: t.name })),
        visible: (d) => d.action_type === "add_tag" || d.action_type === "remove_tag",
      },
      {
        type: "select",
        key: "agent_user_id",
        label: "Atendente responsável",
        required: true,
        placeholder: "Selecione um atendente…",
        emptyMessage: "Nenhum atendente cadastrado no time.",
        persistLabelKey: "agent_user_label",
        options: (ctx) => (ctx.members ?? []).map((m) => ({ value: m.id, label: m.name })),
        visible: (d) => d.action_type === "assign_agent",
      },
      {
        type: "info",
        text:
          "Ações são idempotentes: uma retomada não duplica etiquetas nem reatribui indevidamente.",
        visible: (d) => Boolean(s(d.action_type)),
      },
    ],
    aiAssist: {
      explain: (d) => {
        const t = s(d.action_type);
        if (t === "add_tag") return `Adiciona a etiqueta ${s(d.tag_label) ?? "selecionada"} ao contato.`;
        if (t === "remove_tag") return `Remove a etiqueta ${s(d.tag_label) ?? "selecionada"} do contato.`;
        if (t === "assign_agent") return `Atribui a conversa a ${s(d.agent_user_label) ?? "um atendente"}.`;
        if (t === "stevo_call") return "Dispara uma chamada telefônica de voz via Stevo ao contato.";
        return "Executa uma ação automática no contato ou atendimento.";
      },
    },
  },

  // ============ CONEXÃO DE FLUXO (FB-10.4C) ============
  {
    kind: "flow_connection",
    label: "Conexão de fluxo",
    short: "Direcione o contato para outro fluxo automatizado",
    icon: Workflow,
    accent: "oklch(0.68 0.15 210)",
    category: "logic",
    // Bloco terminal: transfere a execução para o fluxo destino.
    // Sem saídas → o run atual encerra ao concluir a transferência.
    handles: { in: 1, out: [] },
    defaults: {
      label: "Conexão de fluxo",
      target_flow_id: "",
    },
    hints: {
      whenToUse:
        "Encadeie automações: ao chegar aqui, o contato é transferido para outro fluxo desta empresa.",
      examples: [
        "Ao terminar as boas-vindas, iniciar o fluxo 'Qualificação'.",
        "Após a compra, iniciar 'Pós-venda 24h'.",
      ],
    },
    preview: (d) => {
      const label = s(d.target_flow_label);
      if (label) return `Iniciar: “${label}”`;
      if (s(d.target_flow_id)) return "Fluxo selecionado";
      return null;
    },
    validate: (d) => {
      if (!s(d.target_flow_id)) {
        return err("target_flow_id", "Selecione o fluxo que será iniciado.");
      }
      return ok();
    },
    fields: [
      {
        type: "info",
        text:
          "Este bloco encerra o fluxo atual e transfere o contato para o fluxo selecionado, preservando conversa e canal.",
      },
      {
        type: "select",
        key: "target_flow_id",
        label: "Fluxo de destino",
        required: true,
        placeholder: "Selecione um fluxo…",
        emptyMessage: "Nenhum outro fluxo disponível. Crie um fluxo primeiro.",
        persistLabelKey: "target_flow_label",
        options: (ctx) =>
          (ctx.flows ?? [])
            .filter((f) => f.id !== ctx.flowId && f.status !== "archived")
            .map((f) => ({
              value: f.id,
              label: f.name,
              hint: f.status === "active" ? "Publicado" : "Rascunho",
            })),
        help: "Somente fluxos desta empresa aparecem. Fluxo atual e arquivados são ocultos automaticamente.",
      },
    ],
    aiAssist: {
      explain: (d) => {
        const l = s(d.target_flow_label);
        return l
          ? `Transfere o contato para o fluxo “${l}”.`
          : "Transfere o contato para outro fluxo.";
      },
    },
  },

  // ============ RANDOMIZADOR (FB-10.4D) ============
  {
    kind: "randomizer",
    label: "Randomizador",
    short: "Distribua contatos automaticamente entre diferentes caminhos",
    icon: Shuffle,
    accent: "oklch(0.72 0.16 320)",
    category: "logic",
    handles: {
      in: 1,
      out: [
        { id: "route_a", label: "Caminho A" },
        { id: "route_b", label: "Caminho B" },
      ],
    },
    defaults: {
      label: "Randomizador",
      mode: "weighted",
      routes: [
        { id: "route_a", label: "Caminho A", weight: 50 },
        { id: "route_b", label: "Caminho B", weight: 50 },
      ],
    },
    hints: {
      whenToUse:
        "Divida os contatos entre diferentes caminhos com pesos percentuais (ex.: 70% Vendas · 30% Suporte).",
      examples: [
        "70% para 'Oferta A' e 30% para 'Oferta B'.",
        "Distribuição 50/50 entre duas mensagens de teste.",
      ],
    },
    preview: (d) => {
      const routes = parseRoutes(d.routes);
      if (routes.length === 0) return null;
      const totalOk = routes.reduce((a, r) => a + r.weight, 0) === 100;
      const head = routes
        .slice(0, 2)
        .map((r) => `${r.weight}% · ${clip(r.label || "—", 18)}`)
        .join(" / ");
      const rest = routes.length > 2 ? ` (+${routes.length - 2})` : "";
      const suffix = totalOk ? "" : " · soma ≠ 100";
      return `${head}${rest}${suffix}`;
    },
    validate: (d) => {
      const routes = parseRoutes(d.routes);
      if (routes.length < 2) {
        return err("routes", "Adicione pelo menos dois caminhos.");
      }
      if (routes.length > 10) {
        return err("routes", "O randomizador aceita no máximo 10 caminhos.");
      }
      if (routes.some((r) => !r.label.trim())) {
        return err("routes", "Cada caminho precisa de um nome.");
      }
      const ids = routes.map((r) => r.id);
      if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
        return err("routes", "Cada caminho precisa de um identificador único.");
      }
      if (routes.some((r) => !Number.isFinite(r.weight) || r.weight < 0 || r.weight > 100)) {
        return err("routes", "Percentuais precisam estar entre 0 e 100.");
      }
      const total = routes.reduce((a, r) => a + r.weight, 0);
      if (total !== 100) {
        return err("routes", `Os percentuais precisam somar 100% (atual: ${total}%).`);
      }
      const labels = routes.map((r) => r.label.trim().toLowerCase());
      if (new Set(labels).size !== labels.length) {
        return err("routes", "Os caminhos não podem ter nomes repetidos.");
      }
      return ok();
    },
    fields: [
      {
        type: "info",
        text:
          "Cada caminho vira uma saída no bloco. O contato é sorteado de forma proporcional aos percentuais informados.",
      },
      {
        type: "randomizer_routes",
        key: "routes",
        label: "Caminhos e percentuais",
        min: 2,
        max: 10,
      },
    ],
    getHandles: (d) => {
      const routes = parseRoutes(d.routes);
      if (routes.length === 0) {
        return { in: 1, out: [{ id: "route_a", label: "Caminho A" }] };
      }
      return {
        in: 1,
        out: routes.map((r) => ({
          id: r.id,
          label: `${r.weight}% · ${clip(r.label, 18)}`,
        })),
      };
    },
    aiAssist: {
      explain: (d) => {
        const routes = parseRoutes(d.routes);
        if (routes.length === 0) return "Distribui contatos entre caminhos.";
        return `Distribui contatos: ${routes
          .map((r) => `${r.weight}% ${r.label}`)
          .join(" · ")}.`;
      },
    },
  },
];

/**
 * FB-10.4D — parse defensivo das rotas do randomizador.
 * Aceita dados vindos do banco / edições parciais e garante o shape
 * { id, label, weight } exigido pelo restante da UI e Runtime.
 */
export function parseRoutes(
  raw: unknown,
): Array<{ id: string; label: string; weight: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      if (!r || typeof r !== "object") return null;
      const o = r as { id?: unknown; label?: unknown; weight?: unknown };
      const id = typeof o.id === "string" && o.id ? o.id : "";
      const label = typeof o.label === "string" ? o.label : "";
      const weight =
        typeof o.weight === "number" && Number.isFinite(o.weight) ? o.weight : 0;
      if (!id) return null;
      return { id, label, weight };
    })
    .filter((r): r is { id: string; label: string; weight: number } => !!r);
}


// ------------------------------------------------------------------
// Helper para preview de mídia — usado por image/video/audio/document
// ------------------------------------------------------------------
function mediaPreview(noun: string): (d: Record<string, unknown>) => string | null {
  return (d) => {
    const name = s(d.media_filename);
    if (name) return name;
    if (s(d.media_url)) return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} anexado`;
    return null;
  };
}

// ------------------------------------------------------------------
// Status derivado (FB-06) — padrão para todos os blocos
// ------------------------------------------------------------------
function defaultStatus(def: BlockSpec): (d: Record<string, unknown>) => BlockStatus {
  return (data) => {
    if (!def.validate) return "configured";
    const r = def.validate(data);
    if (!r.valid) return "incomplete";
    if (r.issues.some((i) => i.severity === "warning")) return "attention";
    return "configured";
  };
}

// ------------------------------------------------------------------
// Registro no Registry (idempotente)
// ------------------------------------------------------------------
let installed = false;
export function ensureLegacyBlocksRegistered(): void {
  if (installed) return;
  for (const b of BLOCKS) {
    const def: BlockDefinition = {
      kind: b.kind,
      meta: {
        label: b.label,
        short: b.short,
        category: b.category,
        icon: b.icon,
        accent: b.accent,
        handles: b.handles,
        defaults: b.defaults ?? {},
        hints: b.hints,
      },
      preview: b.preview,
      validate: b.validate,
      status: b.status ?? defaultStatus(b),
      fields: b.fields,
      aiAssist: b.aiAssist,
      getHandles: b.getHandles,
    };
    blockRegistry.register(def);
  }
  installed = true;
}

// Auto-registra na importação: qualquer código que puxe `definitions`
// já ganha o Registry preenchido — evita ordem de import frágil.
ensureLegacyBlocksRegistered();
