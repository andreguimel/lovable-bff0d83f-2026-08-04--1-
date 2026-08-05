import { LayoutGrid, List, KanbanSquare, Rows3, Clock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export type CrmView = "list" | "kanban" | "cards" | "table" | "timeline" | "calendar";

const views: Array<{ id: CrmView; label: string; icon: typeof List }> = [
  { id: "list", label: "Lista", icon: List },
  { id: "kanban", label: "Kanban", icon: KanbanSquare },
  { id: "cards", label: "Cards", icon: LayoutGrid },
  { id: "table", label: "Tabela", icon: Rows3 },
  { id: "timeline", label: "Timeline", icon: Clock },
  { id: "calendar", label: "Calendário", icon: Calendar },
];

export function ViewSwitcher({
  value,
  onChange,
}: {
  value: CrmView;
  onChange: (v: CrmView) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl border border-border/60 bg-muted/50 p-1 shadow-xs">
      {views.map((v) => {
        const active = value === v.id;
        const Icon = v.icon;
        return (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
              active
                ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                : "text-muted-foreground hover:text-foreground",
            )}
            title={v.label}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{v.label}</span>
          </button>
        );
      })}
    </div>
  );
}
