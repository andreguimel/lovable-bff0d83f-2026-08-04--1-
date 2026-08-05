import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WidgetEmpty({
  icon: Icon = Sparkles,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex h-full min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {description && <div className="max-w-xs text-xs text-muted-foreground">{description}</div>}
      </div>
      {action && (
        <Button size="sm" variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
