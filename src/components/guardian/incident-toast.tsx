import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { installGuardianReporter, subscribeGuardianIncidents } from "@/lib/guardian-reporter";

/**
 * Popup global do Guardião: escuta erros capturados pelo reporter e mostra
 * um toast persistente com CTA "Analisar com Guardião".
 */
export function GuardianIncidentListener() {
  const navigate = useNavigate();
  const activeToast = useRef<string | number | null>(null);

  useEffect(() => {
    installGuardianReporter();
    const off = subscribeGuardianIncidents((incidentId, err) => {
      if (activeToast.current != null) toast.dismiss(activeToast.current);
      activeToast.current = toast.error("⚠️ O Guardião detectou um problema", {
        description: err.message.slice(0, 160),
        duration: 30_000,
        icon: <AlertTriangle className="h-4 w-4" />,
        action: {
          label: "Analisar",
          onClick: () => {
            navigate({ to: "/settings/audit", search: { incident: incidentId } as never });
          },
        },
        cancel: { label: "Depois", onClick: () => {} },
      });
    });
    return () => {
      off();
    };
  }, [navigate]);

  return null;
}
