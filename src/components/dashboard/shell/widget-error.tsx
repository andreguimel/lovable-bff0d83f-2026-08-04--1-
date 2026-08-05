import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WidgetError({
  title = "Não foi possível carregar",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-full min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <div className="text-sm font-medium text-foreground">{title}</div>
      {message && <div className="max-w-xs text-xs text-muted-foreground">{message}</div>}
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
