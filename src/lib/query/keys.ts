/**
 * Fábrica única de query keys. Toda `useQuery`/`useMutation`/invalidation
 * deve derivar de `qk.<domain>.<entity>(id)`.
 *
 * Vantagens:
 *  - invalidação previsível (`qk.crm.contacts()` invalida lista + entradas de detalhe se necessário)
 *  - refactors seguros (renomear em um único ponto)
 *  - reduz duplicação
 */

export const qk = {
  crm: {
    all: () => ["crm"] as const,
    contacts: (filters?: Record<string, unknown>) => ["crm", "contacts", filters ?? {}] as const,
    contact: (id: string) => ["crm", "contact", id] as const,
    notes: (contactId: string) => ["crm", "notes", contactId] as const,
    tasks: (contactId: string) => ["crm", "tasks", contactId] as const,
  },
  inbox: {
    all: () => ["inbox"] as const,
    conversations: (filters?: Record<string, unknown>) =>
      ["inbox", "conversations", filters ?? {}] as const,
    conversation: (id: string) => ["inbox", "conversation", id] as const,
    messages: (conversationId: string) => ["inbox", "messages", conversationId] as const,
  },
  flows: {
    all: () => ["flows"] as const,
    list: () => ["flows", "list"] as const,
    flow: (id: string) => ["flows", "flow", id] as const,
    versions: (flowId: string) => ["flows", "versions", flowId] as const,
    runs: (flowId: string) => ["flows", "runs", flowId] as const,
  },
  agents: {
    all: () => ["agents"] as const,
    list: () => ["agents", "list"] as const,
    agent: (id: string) => ["agents", "agent", id] as const,
    runs: (agentId: string) => ["agents", "runs", agentId] as const,
  },
  guardian: {
    all: () => ["guardian"] as const,
    incidents: () => ["guardian", "incidents"] as const,
    health: () => ["guardian", "health"] as const,
  },
  team: {
    all: () => ["team"] as const,
    members: () => ["team", "members"] as const,
    member: (id: string) => ["team", "member", id] as const,
    roles: () => ["team", "roles"] as const,
    permissions: () => ["team", "permissions"] as const,
  },
  campaigns: {
    all: () => ["campaigns"] as const,
    list: () => ["campaigns", "list"] as const,
    campaign: (id: string) => ["campaigns", "campaign", id] as const,
  },
  cascades: {
    all: () => ["cascades"] as const,
    policies: () => ["cascades", "policies"] as const,
    runs: () => ["cascades", "runs"] as const,
  },
  channels: {
    all: () => ["channels"] as const,
    list: () => ["channels", "list"] as const,
    channel: (id: string) => ["channels", "channel", id] as const,
  },
  settings: {
    all: () => ["settings"] as const,
    featureFlags: () => ["settings", "feature-flags"] as const,
    features: () => ["settings", "features"] as const,
    company: () => ["settings", "company"] as const,
  },
  reports: {
    all: () => ["reports"] as const,
    conversations: (range: string) => ["reports", "conversations", range] as const,
    broadcasts: (range: string) => ["reports", "broadcasts", range] as const,
    cascades: (range: string) => ["reports", "cascades", range] as const,
  },
  dashboard: {
    all: () => ["dashboard"] as const,
    widget: (name: string, params?: Record<string, unknown>) =>
      ["dashboard", "widget", name, params ?? {}] as const,
  },
} as const;

/** Política padrão de staleTime/gcTime por tipo de dado. */
export const cachePolicy = {
  realtime: { staleTime: 0, gcTime: 30_000 }, // conversas ao vivo
  frequent: { staleTime: 15_000, gcTime: 5 * 60_000 }, // listagens principais
  stable: { staleTime: 60_000, gcTime: 10 * 60_000 }, // configs, listas de valores
  reference: { staleTime: 5 * 60_000, gcTime: 30 * 60_000 }, // permissões, roles
} as const;
