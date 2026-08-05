import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { refreshStevoChannelStatuses } from "@/lib/channels.functions";

/**
 * Reconcilia periodicamente o status dos canais Stevo com o estado real da
 * instância, para que uma desconexão feita no painel da Stevo apareça aqui.
 */
export function useStevoStatusSync(enabled = true) {
  const qc = useQueryClient();
  const refresh = useServerFn(refreshStevoChannelStatuses);

  const q = useQuery({
    queryKey: ["stevo-status-sync"],
    queryFn: () => refresh({}),
    enabled,
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (q.data && q.data.changed > 0) {
      qc.invalidateQueries({ queryKey: ["channels"] });
    }
  }, [q.data, qc]);
}
