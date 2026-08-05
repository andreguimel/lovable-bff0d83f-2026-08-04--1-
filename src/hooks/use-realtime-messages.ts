import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { subscribeRealtime } from "@/lib/realtime/registry";

interface Options {
  onNewInbound?: (payload: { id: string; direction: string }) => void;
}

export function useRealtimeMessages(conversationId: string | undefined, opts?: Options) {
  const qc = useQueryClient();
  const onNewInbound = opts?.onNewInbound;
  useEffect(() => {
    if (!conversationId) return;
    return subscribeRealtime(`messages:${conversationId}`, {
      table: "messages",
      event: "*",
      filter: `conversation_id=eq.${conversationId}`,
      onEvent: (payload) => {
        qc.invalidateQueries({ queryKey: ["messages", conversationId] });
        qc.invalidateQueries({ queryKey: ["conversations"] });
        const p = payload as {
          eventType?: string;
          new?: { id: string; direction: string; conversation_id: string };
        };
        const row = p.new;
        if (
          p.eventType === "INSERT" &&
          row &&
          row.conversation_id === conversationId &&
          row.direction === "inbound"
        ) {
          onNewInbound?.({ id: row.id, direction: row.direction });
        }
      },
    });
  }, [conversationId, qc, onNewInbound]);
}

export function useRealtimeConversations() {
  const qc = useQueryClient();
  useEffect(() => {
    return subscribeRealtime("conversations:all", {
      table: "conversations",
      event: "*",
      onEvent: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
    });
  }, [qc]);
}
