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
  MessageSquare,
  Play,
  Sparkles,
  StopCircle,
  Tag,
  UserPlus,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";

export type NodeKind =
  | "start"
  | "message"
  | "send_image"
  | "send_audio"
  | "send_video"
  | "send_document"
  | "wait"
  | "wait_reply"
  | "question"
  | "condition"
  | "ai"
  | "transfer"
  | "assign_agent"
  | "tag"
  | "http_request"
  | "webhook"
  | "end";

export type BlockCategory =
  | "channels"
  | "logic"
  | "ai"
  | "crm"
  | "integrations"
  | "system";

export interface BlockMeta {
  kind: NodeKind;
  label: string;
  short: string;
  icon: LucideIcon;
  category: BlockCategory;
  /** oklch accent for the node header + icon */
  accent: string;
  /** number of outgoing handles: 1 default, 2 for conditions */
  outputs?: 0 | 1 | 2;
  inputs?: 0 | 1;
  hidden?: boolean;
}

export const BLOCKS: Record<NodeKind, BlockMeta> = {
  start: {
    kind: "start",
    label: "Início",
    short: "Ponto de partida do fluxo",
    icon: Play,
    category: "system",
    accent: "oklch(0.72 0.14 240)",
    inputs: 0,
    outputs: 1,
  },
  message: {
    kind: "message",
    label: "Conteúdo",
    short: "Envie mensagens, mídias e conteúdos em um único bloco",
    icon: MessageSquare,
    category: "channels",
    accent: "oklch(0.72 0.16 160)",
  },
  send_image: {
    kind: "send_image",
    label: "Enviar imagem",
    short: "PNG, JPG, WebP",
    icon: ImageIcon,
    category: "channels",
    accent: "oklch(0.72 0.18 200)",
    hidden: true,
  },
  send_audio: {
    kind: "send_audio",
    label: "Enviar áudio",
    short: "MP3, OGG ou PTT",
    icon: FileAudio,
    category: "channels",
    accent: "oklch(0.7 0.18 300)",
    hidden: true,
  },
  send_video: {
    kind: "send_video",
    label: "Enviar vídeo",
    short: "MP4 até 16MB",
    icon: FileVideo,
    category: "channels",
    accent: "oklch(0.68 0.2 20)",
    hidden: true,
  },
  send_document: {
    kind: "send_document",
    label: "Enviar arquivo",
    short: "PDF, DOCX, XLSX",
    icon: FileText,
    category: "channels",
    accent: "oklch(0.72 0.14 60)",
    hidden: true,
  },
  question: {
    kind: "question",
    label: "Pergunta",
    short: "Aguarda a resposta do contato",
    icon: ListChecks,
    category: "channels",
    accent: "oklch(0.74 0.16 140)",
  },
  wait: {
    kind: "wait",
    label: "Aguardar",
    short: "Delay em segundos",
    icon: Clock,
    category: "logic",
    accent: "oklch(0.76 0.1 200)",
  },
  wait_reply: {
    kind: "wait_reply",
    label: "Aguardar resposta",
    short: "Esperar resposta sem tempo definido",
    icon: Clock,
    category: "logic",
    accent: "oklch(0.76 0.1 220)",
  },
  condition: {
    kind: "condition",
    label: "Condição",
    short: "Sim / Não com expressão",
    icon: GitBranch,
    category: "logic",
    accent: "oklch(0.78 0.16 75)",
    outputs: 2,
  },
  ai: {
    kind: "ai",
    label: "Chamar IA",
    short: "Roteia para um agente",
    icon: Bot,
    category: "ai",
    accent: "oklch(0.7 0.2 320)",
  },
  transfer: {
    kind: "transfer",
    label: "Transferir para humano",
    short: "Sai da automação",
    icon: Users,
    category: "crm",
    accent: "oklch(0.68 0.22 25)",
  },
  assign_agent: {
    kind: "assign_agent",
    label: "Atribuir agente",
    short: "Designa a conversa",
    icon: UserPlus,
    category: "crm",
    accent: "oklch(0.7 0.14 30)",
  },
  tag: {
    kind: "tag",
    label: "Aplicar tag",
    short: "Marca o contato",
    icon: Tag,
    category: "crm",
    accent: "oklch(0.78 0.13 45)",
  },
  http_request: {
    kind: "http_request",
    label: "Requisição HTTP",
    short: "GET, POST, PUT, DELETE",
    icon: Globe,
    category: "integrations",
    accent: "oklch(0.7 0.14 260)",
  },
  webhook: {
    kind: "webhook",
    label: "Webhook",
    short: "Dispara URL externa",
    icon: Webhook,
    category: "integrations",
    accent: "oklch(0.7 0.14 280)",
  },
  end: {
    kind: "end",
    label: "Encerrar",
    short: "Finaliza o fluxo",
    icon: StopCircle,
    category: "system",
    accent: "oklch(0.6 0.02 250)",
    outputs: 0,
  },
};

export const CATEGORIES: {
  id: BlockCategory;
  label: string;
  icon: LucideIcon;
  hint: string;
}[] = [
  { id: "channels", label: "Canais", icon: MessageSquare, hint: "Enviar conteúdo" },
  { id: "logic", label: "Lógica", icon: GitBranch, hint: "Condições e esperas" },
  { id: "ai", label: "IA", icon: Sparkles, hint: "Blocos inteligentes" },
  { id: "crm", label: "CRM", icon: Users, hint: "Contatos e times" },
  { id: "integrations", label: "Integrações", icon: Webhook, hint: "APIs e webhooks" },
  { id: "system", label: "Sistema", icon: Play, hint: "Início e fim" },
];

export function blocksByCategory(cat: BlockCategory): BlockMeta[] {
  return Object.values(BLOCKS).filter((b) => b.category === cat);
}
