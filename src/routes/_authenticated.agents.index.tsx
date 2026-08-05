import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Plus, Search, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listAgents,
  upsertAgent,
  toggleAgent,
  deleteAgent,
  type Agent,
} from "@/lib/agents.functions";
import { duplicateAgent } from "@/lib/agent-studio.functions";
import { AGENT_MODEL_OPTIONS, DEFAULT_AGENT_MODEL } from "@/lib/agents.constants";
import { AgentCard } from "@/components/agents/agent-card";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileAgentsHome } from "@/components/agents/mobile/mobile-agents-home";

export const Route = createFileRoute("/_authenticated/agents/")({
  head: () => ({
    meta: [
      { title: "AI Studio — Agentes de IA" },
      {
        name: "description",
        content: "Central de agentes IA: crie, teste, monitore e evolua colaboradores digitais.",
      },
    ],
  }),
  component: AgentsRoute,
});

function AgentsRoute() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileAgentsHome /> : <AgentsList />;
}

function AgentsList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => listAgents(),
  });

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [model, setModel] = useState<string>(DEFAULT_AGENT_MODEL);

  const createMut = useMutation({
    mutationFn: () =>
      upsertAgent({
        data: {
          name: name.trim(),
          role: role.trim() || null,
          model,
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
      setOpen(false);
      setName("");
      setRole("");
      qc.invalidateQueries({ queryKey: ["agents"] });
      if (agent?.id) navigate({ to: "/agents/$agentId", params: { agentId: agent.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => toggleAgent({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAgent({ data: { id } }),
    onSuccess: () => {
      toast.success("Agente excluído");
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateMut = useMutation({
    mutationFn: (id: string) => duplicateAgent({ data: { id } }),
    onSuccess: () => {
      toast.success("Agente duplicado");
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    return (agents as Agent[]).filter((a) => {
      if (statusFilter === "active" && !a.is_active) return false;
      if (statusFilter === "paused" && a.is_active) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          a.name.toLowerCase().includes(q) ||
          (a.role ?? "").toLowerCase().includes(q) ||
          (a.department ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [agents, statusFilter, query]);

  const totalActive = (agents as Agent[]).filter((a) => a.is_active).length;

  const kpis = [
    { label: "Agentes ativos", value: String(totalActive) },
    { label: "Total", value: String(agents.length) },
    { label: "Modelos", value: String(new Set((agents as Agent[]).map((a) => a.model)).size) },
    {
      label: "Departamentos",
      value: String(
        new Set((agents as Agent[]).map((a) => a.department).filter(Boolean)).size || "—",
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      {/* Hero */}
      <div className="studio-header">
        <div className="studio-avatar">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold">AI Studio</h1>
          <p className="text-sm text-muted-foreground">
            Central de comando dos seus colaboradores digitais. Crie, teste, monitore e evolua
            agentes IA em um único lugar.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1 h-4 w-4" /> Novo agente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo agente</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Nome</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Ana Vendas"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Papel</Label>
                <Input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Ex.: SDR de vendas"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Modelo</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_MODEL_OPTIONS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createMut.mutate()}
                disabled={!name.trim() || createMut.isPending}
              >
                {createMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Criar agente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="studio-kpi">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {k.label}
            </p>
            <p className="font-display text-xl font-semibold">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, papel ou departamento…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as never)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="paused">Pausados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-12 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <p className="text-base font-semibold">Nenhum agente por aqui</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie seu primeiro colaborador digital em segundos.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Novo agente
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              onToggle={(v) => toggleMut.mutate({ id: a.id, is_active: v })}
              onDelete={() => {
                if (confirm(`Excluir "${a.name}"?`)) deleteMut.mutate(a.id);
              }}
              onDuplicate={() => duplicateMut.mutate(a.id)}
              onTest={() => navigate({ to: "/agents/$agentId", params: { agentId: a.id } })}
            />
          ))}
        </div>
      )}
      {/* Hidden link avoids unused import lint if user removes filters */}
      <Link to="/agents" className="hidden" />
    </div>
  );
}
