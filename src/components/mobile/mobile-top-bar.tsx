import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Menu, Search, User } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { getUnreadSummary } from "@/lib/analytics.functions";

const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, "Dashboard"],
  [/^\/inbox/, "Inbox"],
  [/^\/crm/, "CRM"],
  [/^\/flows/, "Fluxos"],
  [/^\/agents/, "Agentes"],
  [/^\/campaigns/, "Campanhas"],
  [/^\/cascades/, "Cascatas"],
  [/^\/channels/, "Canais"],
  [/^\/funnels/, "Funil"],
  [/^\/quick-replies/, "Respostas"],
  [/^\/reports/, "Relatórios"],
  [/^\/team/, "Equipe"],
  [/^\/settings\/audit/, "Guardião"],
  [/^\/settings/, "Ajustes"],
];

function useRouteTitle() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const match = TITLES.find(([re]) => re.test(pathname));
  return match ? match[1] : "Zenda";
}

export function MobileTopBar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const title = useRouteTitle();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const { data: notif } = useQuery({
    queryKey: ["unread-summary"],
    queryFn: () => getUnreadSummary(),
    refetchInterval: 30_000,
  });
  const totalNotifs = (notif?.unreadCount ?? 0) + (notif?.exhaustedCount ?? 0);

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/auth", replace: true });
  };

  return (
    <header
      className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-1 border-b border-border/60 glass px-2"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenDrawer}
        aria-label="Abrir menu"
        className="h-11 w-11 rounded-xl"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <h1 className="min-w-0 flex-1 truncate px-1 text-[15px] font-semibold tracking-tight">
        {title}
      </h1>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Notificações"
            className="relative h-11 w-11 rounded-xl"
          >
            <Bell className="h-5 w-5" />
            {totalNotifs > 0 ? (
              <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground ring-2 ring-background">
                {totalNotifs > 99 ? "99+" : totalNotifs}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[calc(100vw-1rem)] max-w-sm overflow-hidden p-0">
          <div className="border-b border-border/60 bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold tracking-tight">Notificações</p>
              <Badge variant="secondary" className="rounded-full">{totalNotifs}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {notif?.unreadCount ?? 0} não lidas · {notif?.exhaustedCount ?? 0} cascatas esgotadas
            </p>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {!notif || notif.items.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">Nada por aqui ✨</p>
            ) : (
              notif.items.map((item) => (
                <Link
                  key={`${item.kind}-${item.id}`}
                  to={item.kind === "unread" ? "/inbox/$conversationId" : "/cascades"}
                  params={item.kind === "unread" ? { conversationId: item.id } : undefined}
                  className="flex items-start gap-3 border-b border-border/40 p-3 transition-colors last:border-0 hover:bg-accent/60 active:bg-accent"
                >
                  <div
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      item.kind === "unread" ? "bg-primary" : "bg-destructive"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                  </div>
                  {item.count > 0 ? (
                    <Badge variant="secondary" className="shrink-0 rounded-full">{item.count}</Badge>
                  ) : null}
                </Link>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Menu do usuário"
            className="h-11 w-11 rounded-xl"
          >
            <User className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
            {email || "Conta"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

export function MobileSearchBar() {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        placeholder="Buscar…"
        className="h-11 w-full rounded-xl border border-border/60 bg-muted/40 pl-9 pr-3 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/40"
      />
    </div>
  );
}
