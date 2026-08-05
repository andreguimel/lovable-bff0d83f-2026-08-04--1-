/**
 * Baileys deletion adapter (HTTP proxy).
 *
 * Baileys itself is a WebSocket client library that cannot run inside a
 * stateless Cloudflare Worker. Zenda deployments run Baileys on a
 * separate long-lived Node process that exposes an HTTP proxy. This
 * adapter speaks that proxy.
 *
 * Standard endpoint used by Zenda's baileys-proxy convention:
 *   POST {base_url}/sessions/{session}/messages/delete
 *   Body:  { jid, id, fromMe, participant? }
 *   Auth:  header `x-api-key: <api_key>`  (or Bearer, depending on proxy)
 *
 * `for_me` maps to a distinct proxy call (`{ .../delete-for-me }`) because
 * Baileys internally supports the `chat.delete` primitive that hides the
 * message on the local device only. Proxies that don't expose it return
 * 404 → we normalize to `unsupported_scope`.
 *
 * Credentials shape (from `channels.credentials`):
 *   {
 *     base_url:      string,   // e.g. "https://baileys.example.com"
 *     session:       string,   // session id
 *     api_key:       string,
 *     auth_scheme?:  "apikey" | "bearer" // defaults to "apikey"
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

type BaileysCreds = {
  base_url?: string;
  session?: string;
  api_key?: string;
  auth_scheme?: "apikey" | "bearer";
  delete_for_everyone_path?: string;
  delete_for_me_path?: string;
};

export type FetchLike = typeof fetch;

export function createBaileysDeletionProvider(fetchImpl: FetchLike = fetch): MessageDeletionProvider {
  return {
    provider: "baileys",
    async delete(
      credsRaw: Record<string, unknown> | null,
      peerPhone: string | null,
      req: MessageDeletionRequest,
    ): Promise<MessageDeletionResult> {
      if (req.scope === "inbox_only") {
        return skippedResult("baileys");
      }

      const creds = (credsRaw ?? {}) as BaileysCreds;
      if (!creds.base_url || !creds.session || !creds.api_key) {
        return missingCredentials(
          "baileys",
          "base_url, session e api_key são obrigatórios em channels.credentials.",
        );
      }
      if (!req.provider_message_id) {
        return invalidPayload("baileys", "provider_message_id ausente na mensagem.");
      }
      if (!peerPhone) {
        return invalidPayload("baileys", "peer_phone ausente (necessário para JID).");
      }

      const jid = peerPhone.includes("@")
        ? peerPhone
        : `${peerPhone.replace(/[^0-9]/g, "")}@s.whatsapp.net`;

      const defaultPath =
        req.scope === "for_everyone"
          ? `/sessions/${creds.session}/messages/delete`
          : `/sessions/${creds.session}/messages/delete-for-me`;
      const path =
        req.scope === "for_everyone"
          ? creds.delete_for_everyone_path ?? defaultPath
          : creds.delete_for_me_path ?? defaultPath;
      const url = `${creds.base_url.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

      const body = {
        jid,
        id: req.provider_message_id,
        fromMe: req.from_me,
      };

      const authHeader: Record<string, string> =
        creds.auth_scheme === "bearer"
          ? { Authorization: `Bearer ${creds.api_key}` }
          : { "x-api-key": creds.api_key };

      try {
        const r = await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify(body),
        });
        const json = (await r.json().catch(() => ({}))) as unknown;
        if (!r.ok) {
          // 404 on delete-for-me typically means the proxy doesn't expose
          // it; normalize as unsupported_scope so callers can decide.
          if (r.status === 404 && req.scope === "for_me") {
            return {
              ok: false,
              provider: "baileys",
              code: "unsupported_scope",
              error: "Baileys proxy não expõe endpoint delete-for-me.",
              request: body,
              response: json,
              http_status: r.status,
              retryable: false,
            };
          }
          return { ...classifyHttpFailure("baileys", r.status, json), request: body };
        }
        return {
          ok: true,
          provider: "baileys",
          provider_ack: true,
          request: body,
          response: json,
          http_status: r.status,
        };
      } catch (e) {
        return {
          ok: false,
          provider: "baileys",
          code: "transient",
          error: e instanceof Error ? e.message : String(e),
          request: body,
          retryable: true,
        };
      }
    },
  };
}

export const baileysDeletionProvider: MessageDeletionProvider = createBaileysDeletionProvider();
