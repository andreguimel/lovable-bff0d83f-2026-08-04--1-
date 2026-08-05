/**
 * Error codes centrais da plataforma. Facilita suporte, logs, i18n.
 * Formato: MODULE_NNN
 */
export const ERR = {
  // Team / RBAC
  TEAM_401: { code: "TEAM_401", message: "Autenticação requerida." },
  TEAM_403: { code: "TEAM_403", message: "Permissão insuficiente." },
  TEAM_404: { code: "TEAM_404", message: "Membro não encontrado." },
  TEAM_409: { code: "TEAM_409", message: "Conflito ao atualizar membro." },
  RBAC_001: { code: "RBAC_001", message: "Permissão desconhecida." },
  RBAC_002: { code: "RBAC_002", message: "Cargo inválido." },

  // Flows
  FLOW_001: { code: "FLOW_001", message: "Fluxo não encontrado." },
  FLOW_002: { code: "FLOW_002", message: "Fluxo sem versão publicada." },
  FLOW_003: { code: "FLOW_003", message: "Nó inválido no grafo." },
  FLOW_004: { code: "FLOW_004", message: "Execução em estado inconsistente." },
  FLOW_005: { code: "FLOW_005", message: "Provedor não retornou sucesso." },

  // CRM
  CRM_014: { code: "CRM_014", message: "Contato duplicado." },

  // Feature Flags
  FF_001: { code: "FF_001", message: "Feature flag não encontrada." },
  FF_002: { code: "FF_002", message: "Dependência de feature flag ausente." },

  // Generic
  VALIDATION_001: { code: "VALIDATION_001", message: "Dados inválidos." },
  NETWORK_001: { code: "NETWORK_001", message: "Falha de rede." },
} as const;

export type ErrorCode = keyof typeof ERR;

export class PlatformError extends Error {
  code: string;
  correlationId?: string;
  constructor(errKey: ErrorCode, detail?: string, correlationId?: string) {
    const base = ERR[errKey];
    super(detail ? `${base.code}: ${detail}` : `${base.code}: ${base.message}`);
    this.code = base.code;
    this.correlationId = correlationId;
    this.name = "PlatformError";
  }
}

export function throwFriendly(errKey: ErrorCode, detail?: string, correlationId?: string): never {
  throw new PlatformError(errKey, detail, correlationId);
}
