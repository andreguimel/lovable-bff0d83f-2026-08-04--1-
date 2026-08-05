import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export function useRealtimeChannels() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("channels:all")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channels" },
        () => {
          qc.invalidateQueries({ queryKey: ["channels"] });
          qc.invalidateQueries({ queryKey: ["channel"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "channel_events" },
        () => {
          qc.invalidateQueries({ queryKey: ["channel"] });
          qc.invalidateQueries({ queryKey: ["channels"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
