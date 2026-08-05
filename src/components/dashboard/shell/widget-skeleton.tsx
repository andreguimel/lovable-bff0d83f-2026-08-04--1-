import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Skeleton shimmer que segue o shape do widget. Substitui todo Loader2. */
export function WidgetSkeleton({
  variant = "default",
  className,
}: {
  variant?: "default" | "kpi" | "list" | "chart" | "timeline";
  className?: string;
}) {
  if (variant === "kpi") {
    return (
      <div className={cn("grid grid-cols-4 gap-3", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-2xl border border-border/60 bg-card/60 p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }
  if (variant === "list") {
    return (
      <div className={cn("space-y-2 p-1", className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border/40 p-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    );
  }
  if (variant === "chart") {
    return (
      <div className={cn("space-y-3 p-1", className)}>
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="flex gap-2">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
    );
  }
  if (variant === "timeline") {
    return (
      <div className={cn("space-y-3 p-1", className)}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={cn("space-y-2 p-1", className)}>
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
