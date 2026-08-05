import { Mail, LayoutList, Clock, Star, Users } from "lucide-react";

import { cn } from "@/lib/utils";

export type InboxTab = "unread" | "all" | "groups" | "recent" | "starred";

const tabs: Array<{ value: InboxTab; label: string; icon: typeof Mail }> = [
  { value: "unread", label: "Não lido", icon: Mail },
  { value: "all", label: "Diretas", icon: LayoutList },
  { value: "groups", label: "Grupos", icon: Users },
  { value: "recent", label: "Recente", icon: Clock },
  { value: "starred", label: "Estrelado", icon: Star },
];

export function InboxTabs({
  value,
  onChange,
  unreadCount = 0,
  size = "sm",
}: {
  value: InboxTab;
  onChange: (v: InboxTab) => void;
  unreadCount?: number;
  size?: "sm" | "md";
}) {
  return (
    <div role="tablist" aria-label="Filtros da caixa de entrada" className="flex items-stretch gap-1">
      {tabs.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-1 rounded-lg px-1 pb-2 pt-1.5 transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="relative">
              <t.icon
                className={cn(size === "md" ? "h-5 w-5" : "h-4 w-4")}
                fill={t.value === "starred" && active ? "currentColor" : "none"}
              />
              {t.value === "unread" && unreadCount > 0 && (
                <span className="absolute -right-2.5 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </span>
            <span className={cn("truncate font-medium", size === "md" ? "text-[12px]" : "text-[11px]")}>
              {t.label}
            </span>
            <span
              className={cn(
                "absolute inset-x-1 bottom-0 h-0.5 rounded-full transition-colors",
                active ? "bg-primary" : "bg-transparent",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
