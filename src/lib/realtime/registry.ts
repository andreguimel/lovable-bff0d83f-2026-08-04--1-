/**
 * Registry central de canais Realtime. Evita duplicar subscriptions quando
 * múltiplos widgets/hooks assinam a mesma combinação (canal + tabela + filtro).
 *
 * Uso:
 *   const unsub = subscribeRealtime("dashboard:messages", {
 *     table: "messages",
 *     event: "*",
 *     schema: "public",
 *     onEvent: (payload) => queryClient.invalidateQueries(...),
 *   });
 *   return unsub;  // ← chamado no cleanup do useEffect
 *
 * Um channel é criado uma única vez por chave. Handlers adicionais são
 * anexados sem re-subscribir. Quando o último handler é removido, o channel
 * é desmontado.
 */

import { supabase } from "@/integrations/supabase/client";

type RealtimeHandler = (payload: unknown) => void;

type RealtimeConfig = {
  table: string;
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
  schema?: string;
  filter?: string;
  onEvent: RealtimeHandler;
};

type ChannelEntry = {
  channel: ReturnType<typeof supabase.channel>;
  handlers: Set<RealtimeHandler>;
};

const channels = new Map<string, ChannelEntry>();

function keyOf(name: string, cfg: RealtimeConfig): string {
  return [name, cfg.schema ?? "public", cfg.table, cfg.event ?? "*", cfg.filter ?? ""].join("|");
}

export function subscribeRealtime(name: string, cfg: RealtimeConfig): () => void {
  const key = keyOf(name, cfg);
  let entry = channels.get(key);

  if (!entry) {
    // IMPORTANTE: usar `key` (não `name`) como identificador do canal.
    // Supabase reusa a instância de canal por nome; se o mesmo `name` for
    // reaproveitado com outra tabela/filtro, o segundo `.on("postgres_changes")`
    // acontece depois do primeiro `.subscribe()` e o SDK lança
    // "cannot add postgres_changes callbacks after subscribe()".
    const channel = supabase
      .channel(key)

      .on(
        "postgres_changes" as never,
        {
          event: cfg.event ?? "*",
          schema: cfg.schema ?? "public",
          table: cfg.table,
          ...(cfg.filter ? { filter: cfg.filter } : {}),
        } as never,
        (payload: unknown) => {
          entry?.handlers.forEach((h) => {
            try {
              h(payload);
            } catch {
              // handler failures não podem quebrar outros handlers
            }
          });
        },
      )
      .subscribe();
    entry = { channel, handlers: new Set() };
    channels.set(key, entry);
  }

  entry.handlers.add(cfg.onEvent);

  return () => {
    const e = channels.get(key);
    if (!e) return;
    e.handlers.delete(cfg.onEvent);
    if (e.handlers.size === 0) {
      supabase.removeChannel(e.channel);
      channels.delete(key);
    }
  };
}

/** Debug/test helper — número de channels ativos. */
export function activeChannelCount(): number {
  return channels.size;
}
