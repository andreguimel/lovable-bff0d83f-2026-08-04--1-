/**
 * Invalidations centralizadas: mapeia eventos de domínio para as query keys
 * afetadas. Todo `useMutation.onSuccess` deve delegar para `invalidateFor(event)`.
 */

import type { QueryClient } from "@tanstack/react-query";
import { qk } from "./keys";
import type { EventType } from "@/lib/events/registry";

type InvalidatorFn = (qc: QueryClient, payload?: Record<string, unknown>) => void;

const map: Partial<Record<EventType, InvalidatorFn[]>> = {
  "conversation.created": [(qc) => qc.invalidateQueries({ queryKey: qk.inbox.all() })],
  "conversation.updated": [
    (qc, p) => qc.invalidateQueries({ queryKey: qk.inbox.conversations() }),
    (qc, p) => p?.id && qc.invalidateQueries({ queryKey: qk.inbox.conversation(String(p.id)) }),
  ],
  "message.sent": [
    (qc, p) =>
      p?.conversationId &&
      qc.invalidateQueries({ queryKey: qk.inbox.messages(String(p.conversationId)) }),
  ],
  "message.received": [
    (qc, p) =>
      p?.conversationId &&
      qc.invalidateQueries({ queryKey: qk.inbox.messages(String(p.conversationId)) }),
  ],
  "contact.created": [(qc) => qc.invalidateQueries({ queryKey: qk.crm.all() })],
  "contact.updated": [
    (qc, p) => qc.invalidateQueries({ queryKey: qk.crm.contacts() }),
    (qc, p) => p?.id && qc.invalidateQueries({ queryKey: qk.crm.contact(String(p.id)) }),
  ],
  "flow.executed": [
    (qc, p) => p?.flowId && qc.invalidateQueries({ queryKey: qk.flows.runs(String(p.flowId)) }),
  ],
  "flow.finished": [
    (qc, p) => p?.flowId && qc.invalidateQueries({ queryKey: qk.flows.runs(String(p.flowId)) }),
  ],
  "agent.finished": [
    (qc, p) => p?.agentId && qc.invalidateQueries({ queryKey: qk.agents.runs(String(p.agentId)) }),
  ],
  "campaign.sent": [(qc) => qc.invalidateQueries({ queryKey: qk.campaigns.all() })],
  "guardian.incident.opened": [(qc) => qc.invalidateQueries({ queryKey: qk.guardian.all() })],
  "guardian.incident.resolved": [(qc) => qc.invalidateQueries({ queryKey: qk.guardian.all() })],
  "rbac.permission.changed": [(qc) => qc.invalidateQueries({ queryKey: qk.team.permissions() })],
  "featureflag.toggled": [(qc) => qc.invalidateQueries({ queryKey: qk.settings.featureFlags() })],
  "channel.connected": [(qc) => qc.invalidateQueries({ queryKey: qk.channels.all() })],
  "channel.disconnected": [(qc) => qc.invalidateQueries({ queryKey: qk.channels.all() })],
};

export function invalidateFor(
  qc: QueryClient,
  event: EventType,
  payload?: Record<string, unknown>,
) {
  const fns = map[event] ?? [];
  for (const fn of fns) fn(qc, payload);
}
