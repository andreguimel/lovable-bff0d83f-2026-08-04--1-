import { LayoutGrid, List, Table2, Network, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export type TeamView = "cards" | "list" | "table" | "org" | "teams";

const VIEWS: { key: TeamView; label: string; icon: any }[] = [
  { key: "cards", label: "Cards", icon: LayoutGrid },
  { key: "list", label: "Lista", icon: List },
  { key: "table", label: "Tabela", icon: Table2 },
  { key: "org", label: "Organograma", icon: Network },
  { key: "teams", label: "Times", icon: Users },
];

export function ViewSwitcher({ value, onChange }: { value: TeamView; onChange: (v: TeamView) => void }) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-border/60 bg-card">
      {VIEWS.map((v) => (
        <Button
          key={v.key}
          size="sm"
          variant={value === v.key ? "secondary" : "ghost"}
          className="h-8 px-3 text-xs"
          onClick={() => onChange(v.key)}
        >
          <v.icon className="h-3.5 w-3.5 mr-1.5" />
          {v.label}
        </Button>
      ))}
    </div>
  );
}
