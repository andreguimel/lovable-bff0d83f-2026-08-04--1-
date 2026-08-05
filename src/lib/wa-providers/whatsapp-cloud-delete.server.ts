/**
 * WhatsApp Cloud API deletion adapter.
 *
 * Reality check (Meta docs, verified as of 2026-07):
 *  - The Cloud API does NOT expose a public message-revoke endpoint.
 *    Businesses using On-Premises or Business App can revoke, but the
 *    Cloud tenant cannot.
 *  - Therefore `scope='for_everyone'` returns `unsupported_scope`.
 *  - `scope='for_me'` is also not a Cloud primitive — the message stays
 *    in the recipient's chat and there's no server-side hide. We treat
 *    it as a local operation (no provider call), returning skipped=true.
 *  - `scope='inbox_only'` never touches the provider by contract.
 *
 * When Meta eventually exposes a revoke endpoint, this adapter is the
 * single place that needs to change.
 */
import type {
  MessageDeletionProvider,
  MessageDeletionRequest,
  MessageDeletionResult,
} from "./deletion-contract.server";
import { skippedResult, unsupportedScope } from "./deletion-contract.server";

export const whatsappCloudDeletionProvider: MessageDeletionProvider = {
  provider: "whatsapp_cloud",
  async delete(
    _creds: Record<string, unknown> | null,
    _peerPhone: string | null,
    req: MessageDeletionRequest,
  ): Promise<MessageDeletionResult> {
    if (req.scope === "inbox_only" || req.scope === "for_me") {
      return skippedResult("whatsapp_cloud");
    }
    // for_everyone
    return unsupportedScope(
      "whatsapp_cloud",
      "for_everyone",
      "WhatsApp Cloud API não expõe endpoint público de revoke de mensagens.",
    );
  },
};
