import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export function useRealtimeBroadcasts() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("broadcasts:all")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "broadcasts" },
        () => {
          qc.invalidateQueries({ queryKey: ["broadcasts"] });
          qc.invalidateQueries({ queryKey: ["broadcast"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "broadcast_recipients" },
        () => {
          qc.invalidateQueries({ queryKey: ["broadcast"] });
          qc.invalidateQueries({ queryKey: ["broadcasts"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
