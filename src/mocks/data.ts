// Centralized mock data for the entire shell UI.
// Keep types minimal but expressive — enough to drive rich UI without a backend.

export type Channel = {
  id: string;
  name: string;
  phone: string;
  color: string;
  avatar: string;
  status: "connected" | "disconnected" | "connecting";
  queue: string;
  operators: number;
  messagesSent: number;
  responseRate: number;
  lastConnection: string;
};

export type Tag = { id: string; label: string; color: string };

export type Contact = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  city?: string;
  avatar: string;
  tags: string[];
  funnelStage: string;
  owner: string;
  createdAt: string;
  lastSeen: string;
  value?: number;
};

export type MessageKind =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "location"
  | "contact"
  | "buttons"
  | "list"
  | "system";

export type Message = {
  id: string;
  conversationId: string;
  from: "contact" | "operator" | "agent" | "system";
  authorName?: string;
  kind: MessageKind;
  text?: string;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: string;
  durationSec?: number;
  at: string;
  status?: "sent" | "delivered" | "read";
  reactions?: string[];
  quotedId?: string;
  pinned?: boolean;
};

export type Conversation = {
  id: string;
  contactId: string;
  channelId: string;
  unread: number;
  pinned?: boolean;
  status: "open" | "pending" | "resolved";
  assignedTo?: string;
  assignedType?: "human" | "agent";
  lastMessage: string;
  lastAt: string;
  typing?: boolean;
  online?: boolean;
};

export type Agent = {
  id: string;
  name: string;
  avatar: string;
  role: string;
  model: string;
  temperature: number;
  language: string;
  status: "active" | "paused";
  handled: number;
  csat: number;
  prompt: string;
};

export type Campaign = {
  id: string;
  name: string;
  channelId: string;
  audience: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  status: "draft" | "scheduled" | "running" | "paused" | "done";
  scheduledAt?: string;
};

export type Flow = {
  id: string;
  name: string;
  description: string;
  status: "active" | "draft";
  triggers: string[];
  runs: number;
  updatedAt: string;
};

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: "admin" | "supervisor" | "operator" | "financial" | "legal";
  status: "online" | "away" | "offline";
  handled: number;
};

export type QuickReply = {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  attachments?: number;
};

export type FunnelStage = { id: string; name: string; color: string };

const av = (seed: string) =>
  `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}`;

export const channels: Channel[] = [
  {
    id: "ch-1",
    name: "Vendas Brasil",
    phone: "+55 11 98888-1001",
    color: "oklch(0.75 0.16 160)",
    avatar: av("Vendas BR"),
    status: "connected",
    queue: "Vendas",
    operators: 6,
    messagesSent: 12480,
    responseRate: 0.94,
    lastConnection: "há 2 min",
  },
  {
    id: "ch-2",
    name: "Suporte 24h",
    phone: "+55 11 98888-1002",
    color: "oklch(0.72 0.14 240)",
    avatar: av("Suporte 24h"),
    status: "connected",
    queue: "Suporte",
    operators: 4,
    messagesSent: 8720,
    responseRate: 0.88,
    lastConnection: "agora",
  },
  {
    id: "ch-3",
    name: "Financeiro",
    phone: "+55 11 98888-1003",
    color: "oklch(0.8 0.16 75)",
    avatar: av("Financeiro"),
    status: "connecting",
    queue: "Cobrança",
    operators: 2,
    messagesSent: 3120,
    responseRate: 0.76,
    lastConnection: "há 12 min",
  },
  {
    id: "ch-4",
    name: "Pós-venda",
    phone: "+55 11 98888-1004",
    color: "oklch(0.7 0.2 320)",
    avatar: av("Pos venda"),
    status: "disconnected",
    queue: "Pós-venda",
    operators: 3,
    messagesSent: 5640,
    responseRate: 0.81,
    lastConnection: "há 3 h",
  },
];

export const tags: Tag[] = [
  { id: "t-lead", label: "Lead quente", color: "oklch(0.68 0.22 25)" },
  { id: "t-vip", label: "VIP", color: "oklch(0.8 0.16 75)" },
  { id: "t-novo", label: "Novo cliente", color: "oklch(0.75 0.16 160)" },
  { id: "t-cob", label: "Em cobrança", color: "oklch(0.7 0.2 320)" },
  { id: "t-agend", label: "Agendado", color: "oklch(0.72 0.14 240)" },
];

export const funnelStages: FunnelStage[] = [
  { id: "s-novo", name: "Novo lead", color: "oklch(0.72 0.14 240)" },
  { id: "s-quali", name: "Qualificação", color: "oklch(0.8 0.16 75)" },
  { id: "s-prop", name: "Proposta", color: "oklch(0.7 0.2 320)" },
  { id: "s-nego", name: "Negociação", color: "oklch(0.68 0.22 25)" },
  { id: "s-ganho", name: "Ganho", color: "oklch(0.75 0.16 160)" },
];

const firstNames = [
  "Ana", "Bruno", "Camila", "Diego", "Eduarda", "Felipe", "Gabriela",
  "Henrique", "Isabela", "João", "Karina", "Lucas", "Mariana", "Nicolas",
  "Olívia", "Paulo", "Queila", "Rafael", "Sofia", "Thiago", "Ursula",
  "Vitor", "Wesley", "Yasmin", "Zeca",
];
const lastNames = [
  "Silva", "Souza", "Costa", "Oliveira", "Pereira", "Almeida", "Ferreira",
  "Ribeiro", "Carvalho", "Gomes", "Martins", "Araújo", "Melo", "Barbosa",
  "Rocha", "Dias", "Nunes", "Moreira", "Cardoso", "Teixeira",
];
const companies = [
  "Loja Aurora", "Studio Nova", "Café Terra", "Byte&Co", "Norte Digital",
  "Praia Verde", "Sol Import", "Rota 22", "Verde Fibra", "Casa Bloom",
];
const cities = ["São Paulo", "Rio de Janeiro", "Belo Horizonte", "Curitiba", "Recife", "Porto Alegre"];

const rand = (n: number, seed: number) =>
  Math.abs(Math.sin(seed * 9301 + 49297) * 233280) % n;

export const contacts: Contact[] = Array.from({ length: 36 }, (_, i) => {
  const fn = firstNames[Math.floor(rand(firstNames.length, i + 1))];
  const ln = lastNames[Math.floor(rand(lastNames.length, i + 7))];
  const name = `${fn} ${ln}`;
  const stage = funnelStages[Math.floor(rand(funnelStages.length, i + 3))].id;
  const tagCount = Math.floor(rand(3, i + 5));
  const contactTags = Array.from(
    new Set(
      Array.from({ length: tagCount }, (_, k) => tags[Math.floor(rand(tags.length, i + k + 11))].id),
    ),
  );
  return {
    id: `c-${i + 1}`,
    name,
    phone: `+55 11 9${String(Math.floor(rand(90000000, i + 21) + 10000000)).padStart(8, "0")}`,
    email: `${fn.toLowerCase()}.${ln.toLowerCase()}@email.com`,
    company: companies[Math.floor(rand(companies.length, i + 13))],
    city: cities[Math.floor(rand(cities.length, i + 17))],
    avatar: av(name + i),
    tags: contactTags,
    funnelStage: stage,
    owner: ["Fernanda", "Lucas", "Camila", "Ricardo"][Math.floor(rand(4, i + 23))],
    createdAt: new Date(Date.now() - i * 86400000 * 2).toISOString(),
    lastSeen: `há ${Math.floor(rand(59, i + 29)) + 1} min`,
    value: Math.floor(rand(15000, i + 31)) + 500,
  };
});

const lastMessages = [
  "Boa tarde! Tudo bem?",
  "Consegue me passar o valor?",
  "Perfeito, pode enviar o contrato",
  "Obrigado pelo atendimento!",
  "Preciso de ajuda com meu pedido",
  "Já efetuei o pagamento",
  "Podemos remarcar para amanhã?",
  "Quero cancelar minha assinatura",
  "Você tem em outras cores?",
  "Chegou hoje, muito obrigado 🙌",
];

export const conversations: Conversation[] = contacts.slice(0, 24).map((c, i) => ({
  id: `conv-${i + 1}`,
  contactId: c.id,
  channelId: channels[i % channels.length].id,
  unread: i < 6 ? Math.floor(rand(5, i + 41)) + 1 : 0,
  pinned: i < 2,
  status: (["open", "pending", "resolved"] as const)[Math.floor(rand(3, i + 43))],
  assignedTo: i % 3 === 0 ? "Fernanda IA" : ["Fernanda", "Lucas", "Camila"][i % 3],
  assignedType: i % 3 === 0 ? "agent" : "human",
  lastMessage: lastMessages[i % lastMessages.length],
  lastAt: `${Math.floor(rand(59, i + 47))} min`,
  typing: i === 0,
  online: i < 4,
}));

const now = Date.now();
function buildThread(convId: string, contactName: string): Message[] {
  const base: Array<Partial<Message> & { from: Message["from"]; kind: MessageKind }> = [
    { from: "contact", kind: "text", text: `Oi! Aqui é ${contactName}. Tudo bem?` },
    { from: "operator", kind: "text", text: "Olá! Tudo ótimo, como posso ajudar hoje?" },
    { from: "contact", kind: "text", text: "Vi o produto no Instagram e quero saber mais 😊" },
    {
      from: "operator",
      kind: "image",
      text: "Segue a foto em alta resolução",
      mediaUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600",
    },
    { from: "contact", kind: "text", text: "Ficou lindo! Qual o valor?" },
    {
      from: "agent",
      kind: "text",
      authorName: "Fernanda IA",
      text: "O valor promocional é R$ 249, com 10% no PIX. Quer que eu gere o link?",
    },
    { from: "contact", kind: "audio", durationSec: 12 },
    { from: "operator", kind: "text", text: "Recebi seu áudio, um instante!" },
    {
      from: "operator",
      kind: "document",
      fileName: "Proposta-Comercial.pdf",
      fileSize: "820 KB",
    },
    { from: "contact", kind: "text", text: "Perfeito, pode enviar o contrato ✍️", reactions: ["👍"] },
    {
      from: "operator",
      kind: "buttons",
      text: "Como prefere pagar?",
    },
  ];
  return base.map((m, i) => ({
    id: `${convId}-m${i + 1}`,
    conversationId: convId,
    at: new Date(now - (base.length - i) * 5 * 60000).toISOString(),
    status: m.from !== "contact" ? (i < base.length - 2 ? "read" : "delivered") : undefined,
    ...m,
  })) as Message[];
}

export const messagesByConversation: Record<string, Message[]> = Object.fromEntries(
  conversations.map((conv) => {
    const contact = contacts.find((c) => c.id === conv.contactId)!;
    return [conv.id, buildThread(conv.id, contact.name.split(" ")[0])];
  }),
);

export const agents: Agent[] = [
  {
    id: "a-1",
    name: "Fernanda",
    avatar: av("Fernanda IA"),
    role: "Vendas",
    model: "gemini-2.5-flash",
    temperature: 0.6,
    language: "pt-BR",
    status: "active",
    handled: 1240,
    csat: 4.7,
    prompt:
      "Você é a Fernanda, SDR sênior. Objetivo: qualificar leads, apresentar propostas e agendar reuniões. Tom cordial, direto e consultivo.",
  },
  {
    id: "a-2",
    name: "Lucas",
    avatar: av("Lucas IA"),
    role: "Financeiro",
    model: "gpt-4.1-mini",
    temperature: 0.3,
    language: "pt-BR",
    status: "active",
    handled: 812,
    csat: 4.5,
    prompt: "Você é o Lucas, do financeiro. Ajude com boletos, PIX e negociação de parcelas.",
  },
  {
    id: "a-3",
    name: "Caroline",
    avatar: av("Caroline IA"),
    role: "Cobrança",
    model: "claude-3.5-sonnet",
    temperature: 0.4,
    language: "pt-BR",
    status: "paused",
    handled: 402,
    csat: 4.2,
    prompt: "Caroline realiza cobranças amigáveis, sempre educada e propositiva.",
  },
  {
    id: "a-4",
    name: "Camila",
    avatar: av("Camila IA"),
    role: "Suporte",
    model: "gemini-2.5-flash",
    temperature: 0.5,
    language: "pt-BR",
    status: "active",
    handled: 2103,
    csat: 4.8,
    prompt: "Camila resolve dúvidas de suporte com clareza e empatia.",
  },
  {
    id: "a-5",
    name: "Ricardo",
    avatar: av("Ricardo IA"),
    role: "Pós-venda",
    model: "gpt-4.1-mini",
    temperature: 0.6,
    language: "pt-BR",
    status: "active",
    handled: 590,
    csat: 4.6,
    prompt: "Ricardo acompanha o pós-venda, pede reviews e oferece upsell.",
  },
];

export const campaigns: Campaign[] = [
  {
    id: "cp-1",
    name: "Black Friday — Vendas",
    channelId: "ch-1",
    audience: 4800,
    sent: 4800,
    delivered: 4620,
    read: 3990,
    replied: 812,
    status: "done",
    scheduledAt: "2025-11-25T10:00:00Z",
  },
  {
    id: "cp-2",
    name: "Recuperação de carrinho",
    channelId: "ch-1",
    audience: 1250,
    sent: 720,
    delivered: 705,
    read: 480,
    replied: 96,
    status: "running",
  },
  {
    id: "cp-3",
    name: "Aviso de manutenção",
    channelId: "ch-2",
    audience: 9800,
    sent: 0,
    delivered: 0,
    read: 0,
    replied: 0,
    status: "scheduled",
    scheduledAt: "2026-07-20T14:00:00Z",
  },
  {
    id: "cp-4",
    name: "Reengajamento pós-venda",
    channelId: "ch-4",
    audience: 2100,
    sent: 1050,
    delivered: 1020,
    read: 780,
    replied: 210,
    status: "paused",
  },
];

export const flows: Flow[] = [
  {
    id: "fl-1",
    name: "Boas-vindas & qualificação",
    description: "Recebe novos leads, qualifica orçamento e transfere para vendedor humano.",
    status: "active",
    triggers: ["Nova conversa", "Palavra: começar"],
    runs: 3820,
    updatedAt: "há 2 h",
  },
  {
    id: "fl-2",
    name: "Recuperação de carrinho",
    description: "3 tentativas em 24h, cupom no último toque.",
    status: "active",
    triggers: ["Webhook: cart-abandoned"],
    runs: 1240,
    updatedAt: "ontem",
  },
  {
    id: "fl-3",
    name: "Cobrança amigável",
    description: "Envia lembrete D-3, D-0 e D+3 com opção de PIX.",
    status: "active",
    triggers: ["Tag: em cobrança"],
    runs: 610,
    updatedAt: "há 3 dias",
  },
  {
    id: "fl-4",
    name: "NPS pós-venda",
    description: "Pergunta NPS, agrupa por nota, direciona detratores para humano.",
    status: "draft",
    triggers: ["Funil: Ganho"],
    runs: 0,
    updatedAt: "há 1 semana",
  },
];

export const team: TeamMember[] = [
  {
    id: "u-1",
    name: "Fernanda Alves",
    email: "fernanda@empresa.com",
    avatar: av("Fernanda Alves"),
    role: "admin",
    status: "online",
    handled: 320,
  },
  {
    id: "u-2",
    name: "Lucas Martins",
    email: "lucas@empresa.com",
    avatar: av("Lucas Martins"),
    role: "supervisor",
    status: "online",
    handled: 240,
  },
  {
    id: "u-3",
    name: "Camila Rocha",
    email: "camila@empresa.com",
    avatar: av("Camila Rocha"),
    role: "operator",
    status: "away",
    handled: 410,
  },
  {
    id: "u-4",
    name: "Ricardo Souza",
    email: "ricardo@empresa.com",
    avatar: av("Ricardo Souza"),
    role: "operator",
    status: "online",
    handled: 380,
  },
  {
    id: "u-5",
    name: "Paula Costa",
    email: "paula@empresa.com",
    avatar: av("Paula Costa"),
    role: "financial",
    status: "offline",
    handled: 120,
  },
];

export const quickReplies: QuickReply[] = [
  {
    id: "q-1",
    shortcut: "/boasvindas",
    title: "Boas-vindas",
    body: "Olá {{nome}}! 👋 Que bom ter você por aqui. Como posso ajudar hoje?",
  },
  {
    id: "q-2",
    shortcut: "/contrato",
    title: "Envio de contrato",
    body: "Segue o contrato em anexo, {{nome}}. Qualquer dúvida estou por aqui.",
    attachments: 1,
  },
  {
    id: "q-3",
    shortcut: "/pagamento",
    title: "Link de pagamento",
    body: "Aqui está seu link de pagamento: {{link}}. Válido por 24h.",
  },
  {
    id: "q-4",
    shortcut: "/protocolo",
    title: "Protocolo de atendimento",
    body: "Seu protocolo é #{{protocolo}}. Guarde para futuras consultas.",
  },
  {
    id: "q-5",
    shortcut: "/obrigado",
    title: "Agradecimento",
    body: "Obrigado pelo contato, {{nome}}! Foi um prazer te atender.",
  },
];

export function contactById(id: string) {
  return contacts.find((c) => c.id === id);
}
export function channelById(id: string) {
  return channels.find((c) => c.id === id);
}
export function tagById(id: string) {
  return tags.find((t) => t.id === id);
}
export function stageById(id: string) {
  return funnelStages.find((s) => s.id === id);
}
