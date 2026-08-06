import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  MessagesSquare,
  Users,
  KanbanSquare,
  Workflow,
  Bot,
  Megaphone,
  Phone,
  Zap,
  UserCog,
  Settings,
  BarChart3,
  ShieldCheck,
  Waypoints,
  LogOut,
  Search,
  Moon,
  Sun,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const groups = [
  {
    label: "Atendimento",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Inbox", url: "/inbox", icon: MessagesSquare },
      { title: "CRM", url: "/crm", icon: Users },
      { title: "Funil", url: "/funnels", icon: KanbanSquare },
      { title: "Relatórios", url: "/reports", icon: BarChart3 },
    ],
  },
  {
    label: "Automação",
    items: [
      { title: "Fluxos", url: "/flows", icon: Workflow },
      { title: "Agentes IA", url: "/agents", icon: Bot },
      { title: "Campanhas", url: "/campaigns", icon: Megaphone },
      { title: "Cascatas", url: "/cascades", icon: Waypoints },
      { title: "Mensagens rápidas", url: "/quick-replies", icon: Zap },
    ],
  },
  {
    label: "Configuração",
    items: [
      { title: "Canais", url: "/channels", icon: Phone },
      { title: "Equipe", url: "/team", icon: UserCog },
      { title: "Ajustes", url: "/settings", icon: Settings },
      { title: "Guardião", url: "/settings/audit", icon: ShieldCheck },
    ],
  },
];

const FAVORITE_KEY = "zenda:mobile:favorites";

export function MobileDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState("");
  const [dark, setDark] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    try {
      const raw = localStorage.getItem(FAVORITE_KEY);
      if (raw) setFavorites(JSON.parse(raw));
    } catch {
      /* noop */
    }
    if (typeof document !== "undefined") {
      setDark(document.documentElement.classList.contains("dark"));
    }
  }, []);

  const toggleFavorite = (url: string) => {
    setFavorites((prev) => {
      const next = prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url];
      try {
        localStorage.setItem(FAVORITE_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  };

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* noop */
    }
  };

  const handleSignOut = async () => {
    onOpenChange(false);
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/auth", replace: true });
  };

  const allItems = useMemo(() => groups.flatMap((g) => g.items), []);
  const favItems = allItems.filter((i) => favorites.includes(i.url));
  const q = query.trim().toLowerCase();
  const filteredGroups = q
    ? groups
        .map((g) => ({
          ...g,
          items: g.items.filter((i) => i.title.toLowerCase().includes(q)),
        }))
        .filter((g) => g.items.length > 0)
    : groups;

  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex w-[86%] max-w-[360px] flex-col gap-0 border-r border-border/60 p-0"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-[0_4px_16px_-4px_color-mix(in_oklab,var(--primary)_50%,transparent)]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <path d="M8 9h8L10 14h6" strokeWidth="2.4" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[15px] font-semibold tracking-tight">Zenda</div>
            <div className="truncate text-[11px] text-muted-foreground">{email || "Platform"}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={toggleDark} aria-label="Alternar tema" className="h-10 w-10 rounded-xl">
            {dark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
          </Button>
        </div>

        {/* Search */}
        <div className="border-b border-border/60 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder="Buscar módulos…"
              className="h-11 w-full rounded-xl border border-border/60 bg-muted/40 pl-9 pr-3 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
        </div>

        {/* Scroll */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {favItems.length > 0 && !q ? (
            <div className="mb-2 px-1">
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                Favoritos
              </div>
              <ul className="flex flex-col gap-0.5">
                {favItems.map((item) => (
                  <DrawerLink
                    key={`fav-${item.url}`}
                    item={item}
                    active={isActive(item.url)}
                    isFav
                    onSelect={() => onOpenChange(false)}
                    onToggleFav={() => toggleFavorite(item.url)}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {filteredGroups.map((g) => (
            <div key={g.label} className="mb-2 px-1">
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                {g.label}
              </div>
              <ul className="flex flex-col gap-0.5">
                {g.items.map((item) => (
                  <DrawerLink
                    key={item.url}
                    item={item}
                    active={isActive(item.url)}
                    isFav={favorites.includes(item.url)}
                    onSelect={() => onOpenChange(false)}
                    onToggleFav={() => toggleFavorite(item.url)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-border/60 p-3">
          <Button
            variant="ghost"
            onClick={handleSignOut}
            className="h-12 w-full justify-start gap-3 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4.5 w-4.5" />
            Sair da conta
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DrawerLink({
  item,
  active,
  isFav,
  onSelect,
  onToggleFav,
}: {
  item: { title: string; url: string; icon: typeof LayoutDashboard };
  active: boolean;
  isFav: boolean;
  onSelect: () => void;
  onToggleFav: () => void;
}) {
  return (
    <li className="flex items-stretch">
      <Link
        to={item.url}
        onClick={onSelect}
        className={`group flex min-h-12 flex-1 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors ${
          active
            ? "bg-primary/10 text-primary"
            : "text-foreground/85 hover:bg-accent/60 active:bg-accent"
        }`}
      >
        <item.icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
      </Link>
      <button
        type="button"
        aria-label={isFav ? `Remover ${item.title} dos favoritos` : `Favoritar ${item.title}`}
        onClick={onToggleFav}
        className={`grid h-12 w-11 shrink-0 place-items-center rounded-xl text-lg leading-none transition-colors ${
          isFav ? "text-warning" : "text-muted-foreground/50 hover:text-warning"
        }`}
      >
        {isFav ? "★" : "☆"}
      </button>
    </li>
  );
}
