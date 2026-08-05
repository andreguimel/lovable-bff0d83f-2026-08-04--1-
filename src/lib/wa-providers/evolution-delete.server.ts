/**
 * Evolution API deletion adapter.
 *
 * Evolution API (community WhatsApp gateway, v2 endpoints) exposes:
 *   DELETE {base_url}/chat/deleteMessageForEveryone/{instance}
 *   Body:  { id, remoteJid, fromMe, participant? }
 *   Auth:  header `apikey: <api_key>`
 *
 * `for_me` is not a first-class primitive in Evolution — most deployments
 * only expose "delete for everyone". We treat `for_me` as a local
 * operation (no provider call) and only fire HTTP for `for_everyone`.
 *
 * Credentials shape (from `channels.credentials`):
 *   {
 *     base_url:  string,           // e.g. "https://evo.example.com"
 *     instance:  string,           // instance name
 *     api_key:   string,           // Evolution API key
 *     delete_endpoint_path?: string // optional override for exotic forks
 *   }
 */
import type {
  MessageDeletionProvider,
  MessageDeletionRequest,
  MessageDeletionResult,
} from "./deletion-contract.server";
import {
  classifyHttpFailure,
  invalidPayload,
  missingCredentials,
  skippedResult,
} from "./deletion-contract.server";

type EvolutionCreds = {
  base_url?: string;
  instance?: string;
  api_key?: string;
  delete_endpoint_path?: string;
};

// Injectable fetch for tests.
export type FetchLike = typeof fetch;

export function createEvolutionDeletionProvider(fetchImpl: FetchLike = fetch): MessageDeletionProvider {
  return {
    provider: "evolution",
    async delete(
      credsRaw: Record<string, unknown> | null,
      peerPhone: string | null,
      req: MessageDeletionRequest,
    ): Promise<MessageDeletionResult> {
      if (req.scope === "inbox_only" || req.scope === "for_me") {
        return skippedResult("evolution");
      }

      const creds = (credsRaw ?? {}) as EvolutionCreds;
      if (!creds.base_url || !creds.instance || !creds.api_key) {
        return missingCredentials(
          "evolution",
          "base_url, instance e api_key são obrigatórios em channels.credentials.",
        );
      }
      if (!req.provider_message_id) {
        return invalidPayload("evolution", "provider_message_id ausente na mensagem.");
      }
      if (!peerPhone) {
        return invalidPayload("evolution", "peer_phone ausente (necessário para remoteJid).");
      }

      const remoteJid = peerPhone.includes("@")
        ? peerPhone
        : `${peerPhone.replace(/[^0-9]/g, "")}@s.whatsapp.net`;

      const path = creds.delete_endpoint_path ?? `/chat/deleteMessageForEveryone/${creds.instance}`;
      const url = `${creds.base_url.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
      const body = {
        id: req.provider_message_id,
        remoteJid,
        fromMe: req.from_me,
      };

      try {
        const r = await fetchImpl(url, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            apikey: creds.api_key,
          },
          body: JSON.stringify(body),
        });
        const json = (await r.json().catch(() => ({}))) as unknown;
        if (!r.ok) {
          return { ...classifyHttpFailure("evolution", r.status, json), request: body };
        }
        // Evolution returns `{ status: "SUCCESS" }` on success in v2; older
        // forks return the deleted message object. Both count as ack.
        return {
          ok: true,
          provider: "evolution",
          provider_ack: true,
          request: body,
          response: json,
          http_status: r.status,
        };
      } catch (e) {
        return {
          ok: false,
          provider: "evolution",
          code: "transient",
          error: e instanceof Error ? e.message : String(e),
          request: body,
          retryable: true,
        };
      }
    },
  };
}

export const evolutionDeletionProvider: MessageDeletionProvider = createEvolutionDeletionProvider();
