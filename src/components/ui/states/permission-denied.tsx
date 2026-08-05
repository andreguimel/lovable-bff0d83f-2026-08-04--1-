import { ShieldOff } from "lucide-react";

export function PermissionDenied({
  message = "Você não tem permissão para acessar este recurso.",
}: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/40 p-8 text-center">
      <ShieldOff className="h-8 w-8 text-muted-foreground" />
      <div className="text-sm text-muted-foreground">{message}</div>
    </div>
  );
}
