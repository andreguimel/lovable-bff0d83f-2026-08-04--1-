export const PERMISSION_MODULES: { key: string; label: string; actions: string[] }[] = [
  { key: "crm", label: "CRM", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "inbox", label: "Inbox", actions: ["view", "reply", "transfer", "delete"] },
  { key: "flows", label: "Fluxos", actions: ["create", "edit", "publish", "delete", "duplicate"] },
  { key: "agents", label: "Agentes IA", actions: ["create", "edit", "publish", "train", "delete"] },
  { key: "campaigns", label: "Campanhas", actions: ["create", "send", "cancel", "delete"] },
  { key: "guardian", label: "Guardião", actions: ["view", "execute", "approve"] },
  { key: "team", label: "Equipe", actions: ["view", "invite", "edit", "remove"] },
  { key: "settings", label: "Configurações", actions: ["view", "edit"] },
];

export const ROLE_CATALOG: { key: string; name: string; description: string; color: string }[] = [
  { key: "admin", name: "Administrador", description: "Acesso total a todos os módulos", color: "#ef4444" },
  { key: "supervisor", name: "Supervisor", description: "Gerencia equipe e operação", color: "#8b5cf6" },
  { key: "operator", name: "Operador", description: "Atendimento e conversas", color: "#3b82f6" },
  { key: "financial", name: "Financeiro", description: "Módulos financeiros e relatórios", color: "#10b981" },
  { key: "legal", name: "Jurídico", description: "Acesso restrito a jurídico", color: "#6366f1" },
  { key: "marketing", name: "Marketing", description: "Campanhas e broadcasts", color: "#ec4899" },
  { key: "commercial", name: "Comercial", description: "CRM e negócios", color: "#f59e0b" },
  { key: "support", name: "Suporte", description: "Atendimento e resolução", color: "#06b6d4" },
];

export const PRESENCE_LABEL: Record<string, string> = {
  online: "Online",
  offline: "Offline",
  busy: "Em atendimento",
  away: "Ausente",
  meeting: "Em reunião",
  break: "Em pausa",
};
