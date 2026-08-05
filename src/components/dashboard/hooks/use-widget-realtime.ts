import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeRealtime } from "@/lib/realtime/registry";

/**
 * Assina uma ou mais tabelas realtime e invalida as queryKeys informadas.
 * Cleanup automático no unmount. Nunca chamar fora de `useEffect`/hook.
 */
export function useWidgetRealtime(opts: {
  channelName: string;
  tables: string[];
  invalidateKeys: readonly (readonly unknown[])[];
  enabled?: boolean;
}) {
  const { channelName, tables, invalidateKeys, enabled = true } = opts;
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const unsubs = tables.map((table) =>
      subscribeRealtime(channelName, {
        table,
        onEvent: () => {
          for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key });
        },
      }),
    );
    return () => {
      for (const u of unsubs) u();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, tables.join(","), enabled]);
}
