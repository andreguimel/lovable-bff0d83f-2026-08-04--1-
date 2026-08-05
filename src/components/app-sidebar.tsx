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
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";


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

export function AppSidebar() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (path: string) =>
    path === "/" ? currentPath === "/" : currentPath.startsWith(path);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/70">
      <SidebarHeader className="border-b border-sidebar-border/60">
        <Link to="/" className="flex items-center gap-2.5 px-2 py-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-[0_4px_16px_-4px_color-mix(in_oklab,var(--primary)_50%,transparent)]">
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h6v6H4z" />
              <path d="M14 4h6v6h-6z" />
              <path d="M4 14h6v6H4z" />
              <path d="M17 14v6M14 17h6" />
            </svg>
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="truncate font-display text-[15px] font-semibold tracking-tight">Zenda</div>
            <div className="truncate text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Platform
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-1 px-1 py-2">
        {groups.map((g) => (
          <SidebarGroup key={g.label} className="py-1">
            <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
              {g.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => {
                  const active = isActive(item.url);
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="group/mi relative h-9 gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-sidebar-foreground/80 transition-all data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-semibold hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                      >
                        <Link to={item.url}>
                          <span
                            className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-all ${
                              active
                                ? "opacity-100 scale-y-100"
                                : "opacity-0 scale-y-50 group-hover/mi:opacity-40 group-hover/mi:scale-y-75"
                            }`}
                            aria-hidden
                          />
                          <item.icon
                            className={`h-4 w-4 shrink-0 transition-colors ${
                              active ? "text-primary" : "text-muted-foreground group-hover/mi:text-foreground"
                            }`}
                          />
                          <span className="truncate">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60">
        <div className="flex items-center gap-2.5 rounded-xl border border-sidebar-border/60 bg-sidebar-accent/40 p-2 group-data-[collapsible=icon]:hidden">
          <div className="relative">
            <img
              src="https://api.dicebear.com/9.x/notionists/svg?seed=Voce"
              alt=""
              className="h-8 w-8 rounded-full bg-background ring-1 ring-sidebar-border"
            />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-sidebar" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold">Você</div>
            <div className="truncate text-[10.5px] text-muted-foreground">Admin · Online</div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
