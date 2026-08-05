/**
 * Event Bus com versionamento explícito.
 *
 * Todo evento persistido em `domain_events` DEVE passar por `emitEvent()`.
 * O writer preenche automaticamente `schemaVersion`, `producerVersion`,
 * `occurredAt`, `correlationId` e valida contra o registry.
 *
 * Consumidores declaram `consumerVersion` para permitir compatibilidade
 * retroativa em migrações de schema.
 */

import { z } from "zod";
import { logger } from "@/lib/observability/logger";
import { counter } from "@/lib/observability/metrics";
import { newCorrelationId } from "@/lib/observability/correlation";

export const APP_PRODUCER_VERSION = 1;

/** Envelope obrigatório de todo evento. */
export const eventEnvelope = z.object({
  type: z.string(),
  schemaVersion: z.number().int().positive(),
  producerVersion: z.number().int().positive(),
  occurredAt: z.string(),
  correlationId: z.string(),
  actorId: z.string().nullable(),
  companyId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
});

export type EventEnvelope<P = Record<string, unknown>> = z.infer<typeof eventEnvelope> & {
  payload: P;
};

/** Registry de eventos conhecidos. Fonte única de verdade. */
export const EVENT_REGISTRY = {
  "conversation.created": { schemaVersion: 1, description: "Nova conversa criada." },
  "conversation.updated": {
    schemaVersion: 2,
    description: "Conversa modificada (status, atribuição, tags).",
  },
  "message.sent": { schemaVersion: 1, description: "Mensagem enviada pelo agente." },
  "message.received": { schemaVersion: 1, description: "Mensagem recebida do contato." },
  "contact.created": { schemaVersion: 1, description: "Contato criado no CRM." },
  "contact.updated": { schemaVersion: 1, description: "Contato atualizado." },
  "flow.executed": { schemaVersion: 1, description: "Execução de fluxo iniciada." },
  "flow.finished": { schemaVersion: 1, description: "Execução de fluxo concluída." },
  "agent.finished": { schemaVersion: 3, description: "Run de agente IA finalizada." },
  "campaign.sent": { schemaVersion: 2, description: "Campanha disparada." },
  "guardian.incident.opened": { schemaVersion: 1, description: "Novo incidente do Guardião." },
  "guardian.incident.resolved": {
    schemaVersion: 1,
    description: "Incidente do Guardião resolvido.",
  },
  "rbac.permission.changed": { schemaVersion: 1, description: "Permissão RBAC alterada." },
  "featureflag.toggled": { schemaVersion: 1, description: "Feature flag habilitada/desabilitada." },
  "channel.connected": { schemaVersion: 1, description: "Canal conectado a um provedor." },
  "channel.disconnected": { schemaVersion: 1, description: "Canal desconectado." },
} as const satisfies Record<string, { schemaVersion: number; description: string }>;

export type EventType = keyof typeof EVENT_REGISTRY;

export interface EmitOptions<P> {
  type: EventType;
  payload: P;
  correlationId?: string;
  actorId?: string | null;
  companyId?: string | null;
  /** Cliente Supabase autenticado (persiste em `domain_events`). Se omisso, apenas loga. */
  supabase?: { from: (t: string) => { insert: (r: unknown) => Promise<unknown> } };
}

export async function emitEvent<P extends Record<string, unknown>>(opts: EmitOptions<P>) {
  const meta = EVENT_REGISTRY[opts.type];
  if (!meta) {
    logger.error("event.unknown", { type: opts.type });
    return;
  }
  const envelope: EventEnvelope<P> = {
    type: opts.type,
    schemaVersion: meta.schemaVersion,
    producerVersion: APP_PRODUCER_VERSION,
    occurredAt: new Date().toISOString(),
    correlationId: opts.correlationId ?? newCorrelationId(),
    actorId: opts.actorId ?? null,
    companyId: opts.companyId ?? null,
    payload: opts.payload,
  };
  counter("events_emitted_total", "Eventos emitidos", {
    type: opts.type,
    version: meta.schemaVersion,
  });

  if (opts.supabase) {
    try {
      await opts.supabase.from("domain_events").insert({
        event_type: envelope.type,
        event_version: envelope.schemaVersion,
        correlation_id: envelope.correlationId,
        actor_id: envelope.actorId,
        company_id: envelope.companyId,
        payload: envelope.payload,
      });
    } catch (err) {
      logger.warn("event.persist.failed", { type: opts.type, error: (err as Error).message });
    }
  }
  return envelope;
}
