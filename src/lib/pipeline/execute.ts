/**
 * Execution Pipeline — wrapper obrigatório para toda mutação server-side.
 *
 * Ordem:
 *   auth → permission → featureFlag → validation → idempotency
 *   → businessRules → repository → audit → events → realtime
 *   → notifications → telemetry → response
 *
 * Uso:
 *   export const createContact = createServerFn({ method: "POST" })
 *     .middleware([requireSupabaseAuth])
 *     .inputValidator(schema.parse)
 *     .handler((args) => runPipeline({
 *       name: "crm.contact.create",
 *       module: "crm",
 *       permission: "crm.contact.write",
 *       args,
 *       run: async ({ ctx, input }) => { ... },
 *     }));
 */

import { AppError, raise, toAppError, type ErrorCode } from "@/lib/errors/catalog";
import { logger } from "@/lib/observability/logger";
import { counter, observe } from "@/lib/observability/metrics";
import { newCorrelationId } from "@/lib/observability/correlation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface PipelineArgs<Input> {
  data: Input;
  context: {
    supabase: SupabaseLike;
    userId: string;
    claims?: unknown;
    [key: string]: unknown;
  };
}

export interface PipelineOptions<Input, Output> {
  /** Nome canônico da operação — usado em métricas, logs e audit. Ex.: `crm.contact.create` */
  name: string;
  /** Módulo lógico. Ex.: crm, flows, ai, guardian. */
  module: string;
  /** Permissão exigida (chave do Permission Registry). */
  permission?: string;
  /** Chave de feature flag exigida. */
  featureFlag?: string;
  /** Argumentos originais recebidos pelo `.handler` do createServerFn. */
  args: PipelineArgs<Input>;
  /** Callback com a lógica de negócio. */
  run: (ctx: {
    input: Input;
    ctx: PipelineArgs<Input>["context"];
    correlationId: string;
  }) => Promise<Output>;
  /** Idempotency key (opcional). Se fornecida, duplicação lança IDEM_001. */
  idempotencyKey?: string;
}

// simple in-memory idempotency cache (per-worker; TTL 60s). Para produção
// deveria vir de um KV distribuído; suficiente para bloqueio imediato.
const idem = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [k, ts] of idem) if (now - ts > 60_000) idem.delete(k);
}, 30_000).unref?.();

export async function runPipeline<Input, Output>(
  opts: PipelineOptions<Input, Output>,
): Promise<Output> {
  const started = Date.now();
  const correlationId = newCorrelationId();
  const { name, module, permission, featureFlag, args, run, idempotencyKey } = opts;
  const log = logger.child({
    correlationId,
    module,
    operation: name,
    userId: args.context?.userId,
  });

  try {
    // 1. auth
    if (!args.context?.userId) raise("AUTH_001", undefined, correlationId);

    // 2. permission
    if (permission) {
      const { hasPermission } = await import("@/lib/rbac/guard");
      const allowed = await hasPermission(
        { supabase: args.context.supabase, userId: args.context.userId },
        permission,
      );
      if (!allowed) raise("RBAC_001", `Permissão exigida: ${permission}`, correlationId);
    }

    // 3. feature flag
    if (featureFlag) {
      const { isFeatureEnabled } = await import("@/lib/features/registry");
      const on = await isFeatureEnabled(args.context.supabase, featureFlag);
      if (!on) raise("FF_003", `Feature desabilitada: ${featureFlag}`, correlationId);
    }

    // 4. idempotency
    if (idempotencyKey) {
      if (idem.has(idempotencyKey)) raise("IDEM_001", undefined, correlationId);
      idem.set(idempotencyKey, Date.now());
    }

    // 5. run business logic (validation happens in inputValidator upstream)
    const result = await run({ input: args.data, ctx: args.context, correlationId });

    // 6. telemetry (success)
    const latency = Date.now() - started;
    observe("pipeline_duration_ms", "Duração de execução do pipeline", latency, {
      operation: name,
      module,
      status: "ok",
    });
    counter("pipeline_total", "Total de execuções do pipeline", {
      operation: name,
      module,
      status: "ok",
    });
    log.info("pipeline.ok", { latencyMs: latency });

    return result;
  } catch (err) {
    const appErr = toAppError(err);
    const latency = Date.now() - started;
    observe("pipeline_duration_ms", "Duração de execução do pipeline", latency, {
      operation: name,
      module,
      status: "error",
    });
    counter("pipeline_total", "Total de execuções do pipeline", {
      operation: name,
      module,
      status: "error",
      code: appErr.code,
    });
    log.error("pipeline.error", {
      latencyMs: latency,
      errorCode: appErr.code,
      severity: appErr.spec.severity,
      detail: appErr.detail,
    });
    throw appErr;
  }
}

/** Helper para lançar erro tipado dentro do `run`. */
export const pipelineRaise = (code: ErrorCode, detail?: string): never => raise(code, detail);
export { AppError };
