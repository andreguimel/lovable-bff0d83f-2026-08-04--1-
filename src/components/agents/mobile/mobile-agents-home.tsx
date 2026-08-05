import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMobileFab } from "@/components/mobile/mobile-fab";
import { listAgents, upsertAgent, type Agent } from "@/lib/agents.functions";
import { DEFAULT_AGENT_MODEL } from "@/lib/agents.constants";

type Filter = "all" | "active" | "paused";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "active", label: "Ativos" },
  { id: "paused", label: "Pausados" },
];

export function MobileAgentsHome() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { setAction } = useMobileFab();

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => listAgents(),
  });

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      upsertAgent({
        data: {
          name: name.trim(),
          role: role.trim() || null,
          model: DEFAULT_AGENT_MODEL,
          temperature: 0.7,
          language: "pt-BR",
          channel_ids: [],
          enabled_tools: [],
          max_turns: 6,
          is_active: true,
          prompt: "Você é um assistente prestativo. Responda de forma clara e objetiva.",
        },
      }),
    onSuccess: (agent) => {
      toast.success("Agente criado");
      setNewOpen(false);
      setName("");
      setRole("");
      qc.invalidateQueries({ queryKey: ["agents"] });
      if (agent?.id) navigate({ to: "/agents/$agentId", params: { agentId: agent.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    setAction({ label: "Novo agente", icon: Plus, onClick: () => setNewOpen(true) });
    return () => setAction(null);
  }, [setAction]);

  const filtered = useMemo(() => {
    return (agents as Agent[]).filter((a) => {
      if (filter === "active" && !a.is_active) return false;
      if (filter === "paused" && a.is_active) return false;
      if (q) {
        const qq = q.toLowerCase();
        return (
          a.name.toLowerCase().includes(qq) ||
          (a.role ?? "").toLowerCase().includes(qq)
        );
      }
      return true;
    });
  }, [agents, filter, q]);

  return (
    <div className="flex flex-col gap-3 pb-24">
      <div className="sticky top-0 z-10 flex flex-col gap-2 bg-background/95 px-4 pb-2 pt-3 backdrop-blur">
        <div>
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-primary">
            <Sparkles className="h-3 w-3" /> AI Studio
          </p>
          <h1 className="font-display text-xl font-bold">Agentes IA</h1>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar agente…"
            className="h-10 pl-8"
          />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors " +
                (filter === f.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">Nenhum agente ainda</p>
            <Button size="sm" className="mt-1" onClick={() => setNewOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Novo agente
            </Button>
          </div>
        ) : (
          filtered.map((a) => {
            const initials = a.name.slice(0, 2).toUpperCase();
            return (
              <Link
                key={a.id}
                to="/agents/$agentId"
                params={{ agentId: a.id }}
                className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm active:scale-[0.99]"
              >
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 font-semibold text-primary">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-display text-sm font-semibold">{a.name}</p>
                    <Badge
                      variant="secondary"
                      className={
                        "shrink-0 text-[10px] " +
                        (a.is_active
                          ? "bg-success/15 text-success"
                          : "bg-muted text-muted-foreground")
                      }
                    >
                      {a.is_active ? "Ativo" : "Pausado"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {a.role ?? "Sem papel"} · {a.model}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    temp {Number(a.temperature).toFixed(1)}
                  </p>
                </div>
              </Link>
            );
          })
        )}
      </div>

      <Sheet open={newOpen} onOpenChange={setNewOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Novo agente</SheetTitle>
          </SheetHeader>
          <div className="grid gap-3 pt-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ma-name">Nome</Label>
              <Input
                id="ma-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Ana Vendas"
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ma-role">Papel (opcional)</Label>
              <Input
                id="ma-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ex.: SDR de vendas"
              />
            </div>
            <Button
              className="w-full"
              disabled={!name.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Criar agente
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
