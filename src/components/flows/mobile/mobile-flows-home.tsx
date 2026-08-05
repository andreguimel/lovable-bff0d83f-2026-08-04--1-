import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  ArchiveRestore,
  CheckCircle2,
  Loader2,
  Plus,
  Search,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientTime } from "@/components/client-time";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMobileFab } from "@/components/mobile/mobile-fab";
import { createFlow, listFlows, setFlowStatus } from "@/lib/flows.functions";

type StatusFilter = "all" | "active" | "draft" | "archived";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "active", label: "Ativos" },
  { id: "draft", label: "Rascunhos" },
  { id: "archived", label: "Arquivados" },
];

export function MobileFlowsHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(listFlows);
  const createFn = useServerFn(createFlow);
  const setStatusFn = useServerFn(setFlowStatus);
  const { setAction } = useMobileFab();

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ["flows-list"],
    queryFn: () => fn(),
  });

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { name: name.trim(), triggerType: "manual" } }),
    onSuccess: ({ id }) => {
      toast.success("Fluxo criado");
      setNewOpen(false);
      setName("");
      qc.invalidateQueries({ queryKey: ["flows-list"] });
      navigate({ to: "/flows/$flowId", params: { flowId: id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const unarchiveMut = useMutation({
    mutationFn: (id: string) => setStatusFn({ data: { flowId: id, status: "draft" } }),
    onSuccess: () => {
      toast.success("Fluxo desarquivado.");
      qc.invalidateQueries({ queryKey: ["flows-list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao desarquivar"),
  });

  useEffect(() => {
    setAction({ label: "Novo fluxo", icon: Plus, onClick: () => setNewOpen(true) });
    return () => setAction(null);
  }, [setAction]);

  const filtered = useMemo(() => {
    return flows.filter((f) => {
      if (filter !== "all" && f.status !== filter) return false;
      if (q && !f.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [flows, filter, q]);

  return (
    <div className="flex flex-col gap-3 pb-24">
      <div className="sticky top-0 z-10 flex flex-col gap-2 bg-background/95 px-4 pb-2 pt-3 backdrop-blur">
        <div>
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-primary">
            <Sparkles className="h-3 w-3" /> Flow Studio
          </p>
          <h1 className="font-display text-xl font-bold">Fluxos</h1>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar fluxo…"
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
              <Zap className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">
              {flows.length === 0 ? "Nenhum fluxo ainda" : "Sem resultados"}
            </p>
            <Button size="sm" className="mt-1" onClick={() => setNewOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Novo fluxo
            </Button>
          </div>
        ) : (
          filtered.map((f) => {
            const active = f.status === "active";
            return (
              <Link
                key={f.id}
                to="/flows/$flowId"
                params={{ flowId: f.id }}
                className="flex flex-col gap-2 rounded-2xl border bg-card p-3 shadow-sm active:scale-[0.99]"
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-display text-sm font-semibold">
                        {f.name}
                      </p>
                      <Badge
                        variant={active ? "default" : "secondary"}
                        className={
                          "shrink-0 text-[10px] " +
                          (active ? "bg-success text-success-foreground" : "")
                        }
                      >
                        {active ? "Ativo" : f.status === "archived" ? "Arquivado" : "Rascunho"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                      {f.description ?? "Sem descrição"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    {f.runs_count.toLocaleString("pt-BR")} exec
                  </span>
                  <span className="flex items-center gap-1">
                    {f.last_run_status === "completed" ? (
                      <CheckCircle2 className="h-3 w-3 text-success" />
                    ) : f.last_run_status === "failed" ? (
                      <XCircle className="h-3 w-3 text-destructive" />
                    ) : null}
                    {f.success_rate != null ? `${f.success_rate}% ok` : "sem métricas"}
                  </span>
                  <span>
                    {f.last_run_at ? <ClientTime iso={f.last_run_at} /> : "nunca"}
                  </span>
                </div>
                {f.status === "archived" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-full gap-1"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      unarchiveMut.mutate(f.id);
                    }}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" /> Desarquivar
                  </Button>
                )}
              </Link>
            );
          })
        )}
      </div>

      <Sheet open={newOpen} onOpenChange={setNewOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Novo fluxo</SheetTitle>
          </SheetHeader>
          <div className="grid gap-3 pt-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mf-name">Nome</Label>
              <Input
                id="mf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Triagem inicial"
                autoFocus
              />
            </div>
            <Button
              className="w-full"
              disabled={!name.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Criar fluxo
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
