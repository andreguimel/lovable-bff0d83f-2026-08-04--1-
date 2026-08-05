import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export function useRealtimeContacts() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("contacts:all")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contacts" },
        () => qc.invalidateQueries({ queryKey: ["contacts"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
