import { Component, type ErrorInfo, type ReactNode, Suspense } from "react";
import { RefreshCw, MoreHorizontal } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WidgetError } from "./widget-error";
import { WidgetSkeleton } from "./widget-skeleton";
import type { WidgetDefinition } from "@/lib/dashboard/widget-registry";
import { usePermission } from "@/hooks/usePermissions";
import { PermissionDenied } from "@/components/ui/states/permission-denied";

/**
 * Isola o crash de um widget para nunca derrubar o Dashboard inteiro.
 * Cada `WidgetFrame` monta seu próprio ErrorBoundary + Suspense boundary.
 */
class WidgetErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void; fallback?: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // Telemetria futura: reportar para observability service
    console.error("[widget-crash]", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <WidgetError
            message={this.state.error.message}
            onRetry={() => {
              this.setState({ error: null });
              this.props.onReset();
            }}
          />
        )
      );
    }
    return this.props.children;
  }
}

export function WidgetFrame({
  widget,
  updatedAt,
  onRefresh,
  isFetching,
  children,
  actions,
  bodyClassName,
  className,
}: {
  widget: Pick<WidgetDefinition, "id" | "title" | "description" | "permission">;
  updatedAt?: Date | null;
  onRefresh?: () => void;
  isFetching?: boolean;
  children: ReactNode;
  actions?: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  const perm = usePermission(widget.permission ?? "");
  const permissionOk = !widget.permission || perm.allowed;

  return (
    <section
      aria-label={widget.title}
      className={cn(
        "group/widget flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-sm backdrop-blur-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {widget.title}
          </h3>
          {widget.description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground/80">{widget.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {updatedAt && (
            <span className="hidden text-[10px] text-muted-foreground/70 sm:inline">
              {formatDistanceToNow(updatedAt, { addSuffix: true, locale: ptBR })}
            </span>
          )}
          {actions}
          {onRefresh && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={onRefresh}
              aria-label="Atualizar widget"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Mais opções">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <div className={cn("flex-1 min-h-0 overflow-auto overscroll-contain p-4", bodyClassName)}>
        {!permissionOk ? (
          <PermissionDenied message="Sem permissão para visualizar este widget." />
        ) : (
          <WidgetErrorBoundary onReset={() => onRefresh?.()}>
            <Suspense fallback={<WidgetSkeleton />}>{children}</Suspense>
          </WidgetErrorBoundary>
        )}
      </div>
    </section>
  );
}
