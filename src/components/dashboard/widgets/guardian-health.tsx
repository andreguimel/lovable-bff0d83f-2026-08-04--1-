import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WidgetSkeleton } from "@/components/dashboard/shell/widget-skeleton";
import { WidgetEmpty } from "@/components/dashboard/shell/widget-empty";
import { ShieldCheck } from "lucide-react";
import { subscribeRealtime } from "@/lib/realtime/registry";
import { cn } from "@/lib/utils";

type Snapshot = {
  id: string;
  status: string | null;
  score: number | null;
  created_at: string;
};
type Incident = { id: string; severity: string; status: string; message: string; kind: string };

export default function GuardianHealthWidget() {
  const [snap, setSnap] = useState<Snapshot | null | undefined>(undefined);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, i] = await Promise.all([
        supabase
          .from("guardian_health_snapshots")
          .select("id, status, score, created_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("guardian_incidents")
          .select("id, severity, status, message, kind")
          .in("status", ["open", "investigating"])
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      if (!alive) return;
      setSnap((s.data ?? null) as Snapshot | null);
      setIncidents((i.data ?? []) as Incident[]);
    })();

    const unsub = subscribeRealtime("dashboard-guardian", {
      table: "guardian_incidents",
      onEvent: async () => {
        const { data } = await supabase
          .from("guardian_incidents")
          .select("id, severity, status, message, kind")
          .in("status", ["open", "investigating"])
          .order("created_at", { ascending: false })
          .limit(5);
        setIncidents((data ?? []) as Incident[]);
      },
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  if (snap === undefined) return <WidgetSkeleton />;

  const score = snap?.score ?? null;
  const status = snap?.status ?? "unknown";
  const tone =
    status === "healthy"
      ? "text-emerald-500 bg-emerald-500/10"
      : status === "degraded"
        ? "text-amber-500 bg-amber-500/10"
        : status === "down"
          ? "text-rose-500 bg-rose-500/10"
          : "text-muted-foreground bg-muted";

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-2xl", tone)}>
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Score
          </div>
          <div className="font-display text-3xl font-black tabular-nums">
            {score !== null ? score.toFixed(0) : "—"}
          </div>
          <div className="text-xs capitalize text-muted-foreground">{status}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {incidents.length ? (
          <ul className="space-y-1.5">
            {incidents.map((i) => (
              <li
                key={i.id}
                className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/50 px-3 py-2"
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    i.severity === "critical" && "bg-rose-500",
                    i.severity === "high" && "bg-orange-500",
                    i.severity === "medium" && "bg-amber-500",
                    i.severity === "low" && "bg-sky-500",
                  )}
                />
                <span className="truncate text-xs">{i.message ?? i.kind ?? "Incidente"}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                  {i.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <WidgetEmpty
            icon={ShieldCheck}
            title="Nenhum incidente"
            description="Sistema saudável."
          />
        )}
      </div>
    </div>
  );
}
