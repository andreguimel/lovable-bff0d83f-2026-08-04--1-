import { Sparkles } from "lucide-react";

import { QuickActions } from "@/components/dashboard/commands/quick-actions";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  useDashboardRange,
  RANGES,
  type DashboardRange,
} from "./dashboard-range-context";

export { RANGES, type DashboardRange, useDashboardRange, DashboardRangeProvider } from "./dashboard-range-context";

export function DashboardHeader({
  greeting,
  range: propRange,
  onRangeChange: propOnRangeChange,
  className,
}: {
  greeting: string;
  range?: DashboardRange;
  onRangeChange?: (r: DashboardRange) => void;
  className?: string;
}) {
  const context = useDashboardRange();
  const activeRange = propRange ?? context.range;
  const handleRangeChange = propOnRangeChange ?? context.setRange;

  return (
    <header
      className={cn(
        "shrink-0 border-b border-border/60 bg-gradient-to-b from-background to-background/60 backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-col gap-3 px-6 pb-3 pt-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              Comando de operação
            </div>
            <h1 className="mt-1 truncate font-display text-2xl font-black tracking-tight text-foreground sm:text-3xl">
              {greeting}
            </h1>
          </div>
          <Tabs value={activeRange} onValueChange={(v) => handleRangeChange(v as DashboardRange)}>
            <TabsList className="h-8 rounded-full border border-border/60 bg-background/70 p-0.5">
              {RANGES.map((r) => (
                <TabsTrigger
                  key={r.key}
                  value={r.key}
                  className="h-7 rounded-full px-3 text-[11px] font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {r.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <QuickActions />
      </div>
    </header>
  );
}

export function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 5) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
