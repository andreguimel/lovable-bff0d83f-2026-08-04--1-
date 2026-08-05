/**
 * PermissionRegistry — Registro central e tipado de todas as permissões da plataforma.
 * Todo o sistema DEVE consumir constantes daqui. NUNCA usar strings soltas.
 *
 * Uso:
 *   import { P } from "@/lib/rbac/registry";
 *   <Can permission={P.CRM.EDIT}>...</Can>
 *   usePermission(P.FLOWS.PUBLISH)
 */

export const P = {
  CRM: {
    VIEW: "crm.view",
    CREATE: "crm.create",
    EDIT: "crm.edit",
    DELETE: "crm.delete",
    EXPORT: "crm.export",
  },
  INBOX: {
    VIEW: "inbox.view",
    RESPOND: "inbox.respond",
    TRANSFER: "inbox.transfer",
    CLOSE: "inbox.close",
    DELETE: "inbox.delete",
  },
  FLOWS: {
    VIEW: "flows.view",
    CREATE: "flows.create",
    EDIT: "flows.edit",
    PUBLISH: "flows.publish",
    DELETE: "flows.delete",
  },
  AGENTS: {
    VIEW: "agents.view",
    CREATE: "agents.create",
    EDIT: "agents.edit",
    EXECUTE: "agents.execute",
    TRAIN: "agents.train",
    DELETE: "agents.delete",
  },
  CAMPAIGNS: {
    VIEW: "campaigns.view",
    CREATE: "campaigns.create",
    SEND: "campaigns.send",
    DELETE: "campaigns.delete",
  },
  CHANNELS: {
    VIEW: "channels.view",
    CREATE: "channels.create",
    EDIT: "channels.edit",
    DELETE: "channels.delete",
  },
  TEAM: {
    VIEW: "team.view",
    INVITE: "team.invite",
    EDIT: "team.edit",
    MANAGE_ROLES: "team.manage_roles",
    REMOVE: "team.remove",
  },
  GUARDIAN: {
    VIEW: "guardian.view",
    RESOLVE: "guardian.resolve",
  },
  FUNNELS: {
    VIEW: "funnels.view",
    MANAGE: "funnels.manage",
    CARD_CREATE: "funnels.card.create",
    CARD_EDIT: "funnels.card.edit",
    CARD_MOVE: "funnels.card.move",
    CARD_DELETE: "funnels.card.delete",
  },
  SETTINGS: {
    VIEW: "settings.view",
    EDIT: "settings.edit",
    FEATURE_FLAGS: "settings.feature_flags",
  },
} as const;

export type PermissionKey =
  | (typeof P)[keyof typeof P][keyof (typeof P)[keyof typeof P]];

export const MODULE_LABELS: Record<string, string> = {
  crm: "CRM",
  inbox: "Inbox",
  flows: "Fluxos",
  agents: "Agentes IA",
  campaigns: "Campanhas",
  channels: "Canais",
  team: "Equipe",
  guardian: "Guardião",
  settings: "Configurações",
  funnels: "Funis",
};

export const ACTION_LABELS: Record<string, string> = {
  view: "Visualizar",
  create: "Criar",
  edit: "Editar",
  delete: "Excluir",
  export: "Exportar",
  respond: "Responder",
  transfer: "Transferir",
  close: "Encerrar",
  publish: "Publicar",
  execute: "Executar",
  train: "Treinar",
  send: "Enviar",
  invite: "Convidar",
  manage_roles: "Gerenciar Permissões",
  remove: "Remover",
  resolve: "Resolver",
  feature_flags: "Feature Flags",
};

/** Flatten all permission keys for iteration / validation. */
export function allPermissionKeys(): string[] {
  const out: string[] = [];
  for (const mod of Object.values(P)) {
    for (const key of Object.values(mod)) out.push(key);
  }
  return out;
}
