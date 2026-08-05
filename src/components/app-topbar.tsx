import { Bell, Command, LogOut, Moon, Search, Sun, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
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
import { Badge } from "@/components/ui/badge";
import { getUnreadSummary } from "@/lib/analytics.functions";

export function AppTopbar() {
  const [dark, setDark] = useState(false);
  const [email, setEmail] = useState<string>("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notif } = useQuery({
    queryKey: ["unread-summary"],
    queryFn: () => getUnreadSummary(),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const stored = localStorage.getItem("theme");
    const prefers =
      stored === "dark" ||
      (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", prefers);
    setDark(prefers);
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("topbar-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["unread-summary"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cascade_runs" }, () => {
        queryClient.invalidateQueries({ queryKey: ["unread-summary"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/auth", replace: true });
  };

  const totalNotifs = (notif?.unreadCount ?? 0) + (notif?.exhaustedCount ?? 0);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 glass px-3">
      <SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-accent" />
      <Separator orientation="vertical" className="mx-1 h-5 opacity-60" />

      <div className="relative hidden max-w-md flex-1 md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar contatos, mensagens, tags…"
          className="h-9 rounded-lg border-border/60 bg-muted/40 pl-9 pr-16 text-sm placeholder:text-muted-foreground/70 focus-visible:bg-background"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border border-border/70 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground md:inline-flex">
          <Command className="h-3 w-3" /> K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <div className="mr-1 hidden items-center gap-2 rounded-full border border-border/70 bg-card/60 py-1 pl-2 pr-3 sm:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">Canais online</span>
        </div>

        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema" className="h-9 w-9 rounded-lg">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-lg" aria-label="Notificações">
              <Bell className="h-4 w-4" />
              {totalNotifs > 0 ? (
                <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground ring-2 ring-background">
                  {totalNotifs > 99 ? "99+" : totalNotifs}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 overflow-hidden p-0">
            <div className="border-b border-border/60 bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold tracking-tight">Notificações</p>
                <Badge variant="secondary" className="rounded-full">{totalNotifs}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {notif?.unreadCount ?? 0} não lidas · {notif?.exhaustedCount ?? 0} cascatas esgotadas
              </p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {!notif || notif.items.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Nada por aqui ✨</p>
              ) : (
                notif.items.map((item) => (
                  <Link
                    key={`${item.kind}-${item.id}`}
                    to={item.kind === "unread" ? "/inbox/$conversationId" : "/cascades"}
                    params={item.kind === "unread" ? { conversationId: item.id } : undefined}
                    className="flex items-start gap-3 border-b border-border/40 p-3 transition-colors last:border-0 hover:bg-accent/60"
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
            <Button variant="ghost" size="icon" className="ml-1 h-9 w-9 rounded-lg" aria-label="Menu do usuário">
              <User className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
              {email || "Conta"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
