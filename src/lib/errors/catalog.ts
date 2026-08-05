/**
 * Enterprise Error Catalog — fonte única de verdade para todos os erros
 * lançados por Server Functions, Domain Services, Repositories e UI.
 *
 * Regras:
 * - Nenhum código de aplicação lança `throw new Error("texto solto")`.
 *   Sempre `throw new AppError("CODE", { detail })` ou `raise("CODE")`.
 * - Códigos são estáveis (contrato público); mensagens podem evoluir.
 * - `docs/errors.md` é gerado a partir deste arquivo.
 */

export type ErrorSeverity = "info" | "warn" | "error" | "critical";
export type ErrorCategory =
  | "auth"
  | "permission"
  | "validation"
  | "not_found"
  | "conflict"
  | "rate_limit"
  | "dependency"
  | "business"
  | "integration"
  | "unknown";

export interface ErrorSpec {
  code: string;
  category: ErrorCategory;
  message: string;
  httpStatus: number;
  retryable: boolean;
  severity: ErrorSeverity;
  docsUrl?: string;
}

const c = <T extends string>(map: Record<T, ErrorSpec>) => map;

export const ERRORS = c({
  // --- Auth ------------------------------------------------------------
  AUTH_001: {
    code: "AUTH_001",
    category: "auth",
    message: "Autenticação requerida.",
    httpStatus: 401,
    retryable: false,
    severity: "warn",
  },
  AUTH_002: {
    code: "AUTH_002",
    category: "auth",
    message: "Sessão expirada.",
    httpStatus: 401,
    retryable: true,
    severity: "warn",
  },
  AUTH_003: {
    code: "AUTH_003",
    category: "auth",
    message: "Provedor OAuth indisponível.",
    httpStatus: 502,
    retryable: true,
    severity: "error",
  },

  // --- RBAC / Permission ----------------------------------------------
  RBAC_001: {
    code: "RBAC_001",
    category: "permission",
    message: "Permissão insuficiente.",
    httpStatus: 403,
    retryable: false,
    severity: "warn",
  },
  RBAC_002: {
    code: "RBAC_002",
    category: "permission",
    message: "Cargo inválido.",
    httpStatus: 400,
    retryable: false,
    severity: "warn",
  },
  RBAC_005: {
    code: "RBAC_005",
    category: "permission",
    message: "Permissão desconhecida no registry.",
    httpStatus: 500,
    retryable: false,
    severity: "error",
  },

  // --- Feature Flags --------------------------------------------------
  FF_001: {
    code: "FF_001",
    category: "not_found",
    message: "Feature flag não encontrada.",
    httpStatus: 404,
    retryable: false,
    severity: "warn",
  },
  FF_002: {
    code: "FF_002",
    category: "dependency",
    message: "Feature dependente desabilitada.",
    httpStatus: 409,
    retryable: false,
    severity: "warn",
  },
  FF_003: {
    code: "FF_003",
    category: "business",
    message: "Feature indisponível para o plano atual.",
    httpStatus: 402,
    retryable: false,
    severity: "info",
  },

  // --- Validation -----------------------------------------------------
  VAL_001: {
    code: "VAL_001",
    category: "validation",
    message: "Dados inválidos.",
    httpStatus: 400,
    retryable: false,
    severity: "warn",
  },
  VAL_002: {
    code: "VAL_002",
    category: "validation",
    message: "Contrato Zod violado.",
    httpStatus: 400,
    retryable: false,
    severity: "error",
  },

  // --- CRM ------------------------------------------------------------
  CRM_001: {
    code: "CRM_001",
    category: "not_found",
    message: "Contato não encontrado.",
    httpStatus: 404,
    retryable: false,
    severity: "warn",
  },
  CRM_014: {
    code: "CRM_014",
    category: "conflict",
    message: "Contato duplicado.",
    httpStatus: 409,
    retryable: false,
    severity: "warn",
  },

  // --- Flows ----------------------------------------------------------
  FLOW_001: {
    code: "FLOW_001",
    category: "not_found",
    message: "Fluxo não encontrado.",
    httpStatus: 404,
    retryable: false,
    severity: "warn",
  },
  FLOW_002: {
    code: "FLOW_002",
    category: "business",
    message: "Fluxo sem versão publicada.",
    httpStatus: 409,
    retryable: false,
    severity: "warn",
  },
  FLOW_003: {
    code: "FLOW_003",
    category: "validation",
    message: "Nó inválido no grafo.",
    httpStatus: 400,
    retryable: false,
    severity: "error",
  },
  FLOW_004: {
    code: "FLOW_004",
    category: "business",
    message: "Execução em estado inconsistente.",
    httpStatus: 409,
    retryable: true,
    severity: "error",
  },
  FLOW_005: {
    code: "FLOW_005",
    category: "integration",
    message: "Provedor não retornou sucesso.",
    httpStatus: 502,
    retryable: true,
    severity: "error",
  },

  // --- Team -----------------------------------------------------------
  TEAM_001: {
    code: "TEAM_001",
    category: "not_found",
    message: "Membro não encontrado.",
    httpStatus: 404,
    retryable: false,
    severity: "warn",
  },
  TEAM_017: {
    code: "TEAM_017",
    category: "conflict",
    message: "Conflito ao atualizar membro.",
    httpStatus: 409,
    retryable: false,
    severity: "warn",
  },

  // --- AI -------------------------------------------------------------
  AI_001: {
    code: "AI_001",
    category: "integration",
    message: "AI Gateway indisponível.",
    httpStatus: 503,
    retryable: true,
    severity: "error",
  },
  AI_021: {
    code: "AI_021",
    category: "business",
    message: "Créditos de IA insuficientes.",
    httpStatus: 402,
    retryable: false,
    severity: "warn",
  },
  AI_030: {
    code: "AI_030",
    category: "rate_limit",
    message: "Rate limit do provedor de IA atingido.",
    httpStatus: 429,
    retryable: true,
    severity: "warn",
  },

  // --- Guardian -------------------------------------------------------
  GUARD_001: {
    code: "GUARD_001",
    category: "not_found",
    message: "Incidente não encontrado.",
    httpStatus: 404,
    retryable: false,
    severity: "warn",
  },
  GUARD_002: {
    code: "GUARD_002",
    category: "business",
    message: "Incidente já resolvido.",
    httpStatus: 409,
    retryable: false,
    severity: "info",
  },

  // --- Campaigns / Broadcasts ----------------------------------------
  CAMP_001: {
    code: "CAMP_001",
    category: "not_found",
    message: "Campanha não encontrada.",
    httpStatus: 404,
    retryable: false,
    severity: "warn",
  },
  CAMP_010: {
    code: "CAMP_010",
    category: "business",
    message: "Lista de destinatários vazia.",
    httpStatus: 400,
    retryable: false,
    severity: "warn",
  },

  // --- Channels / Integrations ---------------------------------------
  CHAN_001: {
    code: "CHAN_001",
    category: "not_found",
    message: "Canal não encontrado.",
    httpStatus: 404,
    retryable: false,
    severity: "warn",
  },
  CHAN_010: {
    code: "CHAN_010",
    category: "integration",
    message: "Canal desconectado do provedor.",
    httpStatus: 424,
    retryable: true,
    severity: "error",
  },

  // --- Generic infra --------------------------------------------------
  RATE_001: {
    code: "RATE_001",
    category: "rate_limit",
    message: "Muitas requisições — tente novamente em instantes.",
    httpStatus: 429,
    retryable: true,
    severity: "warn",
  },
  NET_001: {
    code: "NET_001",
    category: "integration",
    message: "Falha de rede.",
    httpStatus: 502,
    retryable: true,
    severity: "error",
  },
  IDEM_001: {
    code: "IDEM_001",
    category: "conflict",
    message: "Operação duplicada (idempotency key repetida).",
    httpStatus: 409,
    retryable: false,
    severity: "info",
  },
  INTERNAL_001: {
    code: "INTERNAL_001",
    category: "unknown",
    message: "Erro interno inesperado.",
    httpStatus: 500,
    retryable: false,
    severity: "critical",
  },
});

export type ErrorCode = keyof typeof ERRORS;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly spec: ErrorSpec;
  readonly detail?: string;
  readonly correlationId?: string;
  readonly cause?: unknown;
  constructor(
    code: ErrorCode,
    opts: { detail?: string; correlationId?: string; cause?: unknown } = {},
  ) {
    const spec = ERRORS[code];
    super(opts.detail ? `${spec.code}: ${opts.detail}` : `${spec.code}: ${spec.message}`);
    this.name = "AppError";
    this.code = code;
    this.spec = spec;
    this.detail = opts.detail;
    this.correlationId = opts.correlationId;
    this.cause = opts.cause;
  }
  toJSON() {
    return {
      code: this.code,
      category: this.spec.category,
      message: this.detail ?? this.spec.message,
      httpStatus: this.spec.httpStatus,
      retryable: this.spec.retryable,
      severity: this.spec.severity,
      correlationId: this.correlationId,
    };
  }
}

export function raise(code: ErrorCode, detail?: string, correlationId?: string): never {
  throw new AppError(code, { detail, correlationId });
}

export function toAppError(err: unknown, fallback: ErrorCode = "INTERNAL_001"): AppError {
  if (err instanceof AppError) return err;
  const detail = err instanceof Error ? err.message : String(err);
  return new AppError(fallback, { detail, cause: err });
}
