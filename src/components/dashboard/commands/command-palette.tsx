import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useRouter } from "@tanstack/react-router";
import {
  Bot,
  LayoutDashboard,
  MessagesSquare,
  Send,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

const NAV = [
  { icon: LayoutDashboard, label: "Dashboard", to: "/" as const },
  { icon: MessagesSquare, label: "Inbox", to: "/inbox" as const },
  { icon: Users, label: "CRM", to: "/crm" as const },
  { icon: Workflow, label: "Fluxos", to: "/flows" as const },
  { icon: Bot, label: "Agentes IA", to: "/agents" as const },
  { icon: Send, label: "Campanhas", to: "/campaigns" as const },
  { icon: Zap, label: "Cascatas", to: "/cascades" as const },
  { icon: ShieldCheck, label: "Guardião", to: "/settings" as const },
  { icon: Settings, label: "Configurações", to: "/settings" as const },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Pesquisar clientes, fluxos, campanhas..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado.</CommandEmpty>
        <CommandGroup heading="Navegação">
          {NAV.map((n) => (
            <CommandItem
              key={n.to + n.label}
              value={n.label}
              onSelect={() => {
                setOpen(false);
                router.navigate({ to: n.to });
              }}
            >
              <n.icon className="mr-2 h-4 w-4" />
              {n.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Ações rápidas">
          <CommandItem
            value="Nova conversa"
            onSelect={() => {
              setOpen(false);
              router.navigate({ to: "/inbox" });
            }}
          >
            <MessagesSquare className="mr-2 h-4 w-4" /> Nova conversa
          </CommandItem>
          <CommandItem
            value="Novo contato"
            onSelect={() => {
              setOpen(false);
              router.navigate({ to: "/crm" });
            }}
          >
            <Users className="mr-2 h-4 w-4" /> Novo contato
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
