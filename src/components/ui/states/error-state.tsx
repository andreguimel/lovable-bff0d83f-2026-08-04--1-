import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({
  title = "Algo deu errado",
  message,
  code,
  onRetry,
}: {
  title?: string;
  message?: string;
  code?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <div>
        <div className="font-medium">{title}</div>
        {message && <div className="mt-1 text-sm text-muted-foreground">{message}</div>}
        {code && <div className="mt-1 font-mono text-xs text-muted-foreground">Código: {code}</div>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw className="mr-2 h-4 w-4" /> Tentar novamente
        </Button>
      )}
    </div>
  );
}
