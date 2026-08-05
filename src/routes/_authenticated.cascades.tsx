import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, GripVertical, Loader2, Play, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientTime } from "@/components/client-time";
import {
  createCascadePolicy,
  deleteCascadePolicy,
  listCascadePolicies,
  listCascadeRuns,
  updateCascadePolicy,
  type CascadeStep,
} from "@/lib/cascade.functions";

export const Route = createFileRoute("/_authenticated/cascades")({
  head: () => ({
    meta: [
      { title: "Cascatas — Zenda" },
      { name: "description", content: "Tentativas em cascata entre WhatsApp, e-mail e SMS." },
    ],
  }),
  component: CascadesPage,
});

const CHANNEL_LABEL: Record<CascadeStep["channel_type"], string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  sms: "SMS",
};

function emptyStep(channel: CascadeStep["channel_type"] = "whatsapp"): CascadeStep {
  return { channel_type: channel, wait_minutes: 60, message: "", subject: "" };
}

function CascadesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCascadePolicies);
  const createFn = useServerFn(createCascadePolicy);
  const updateFn = useServerFn(updateCascadePolicy);
  const deleteFn = useServerFn(deleteCascadePolicy);
  const runsFn = useServerFn(listCascadeRuns);

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["cascade-policies"],
    queryFn: () => listFn(),
  });
  const { data: runs = [] } = useQuery({
    queryKey: ["cascade-runs"],
    queryFn: () => runsFn(),
    refetchInterval: 15_000,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<null | {
    id?: string;
    name: string;
    description: string;
    active: boolean;
    steps: CascadeStep[];
  }>(null);

  const createMut = useMutation({
    mutationFn: (p: { name: string; description?: string; steps: CascadeStep[]; active?: boolean }) =>
      createFn({ data: p }),
    onSuccess: () => {
      toast.success("Cascata criada");
      qc.invalidateQueries({ queryKey: ["cascade-policies"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: (p: {
      id: string;
      name?: string;
      description?: string | null;
      steps?: CascadeStep[];
      active?: boolean;
    }) => updateFn({ data: p }),
    onSuccess: () => {
      toast.success("Cascata atualizada");
      qc.invalidateQueries({ queryKey: ["cascade-policies"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Cascata removida");
      qc.invalidateQueries({ queryKey: ["cascade-policies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing({ name: "", description: "", active: true, steps: [emptyStep("whatsapp"), emptyStep("email")] });
    setOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" /> Cascatas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tentativas em ordem: se um canal não gerar resposta, avança para o próximo automaticamente.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-1.5 h-4 w-4" /> Nova cascata
        </Button>
      </div>

      <Tabs defaultValue="policies">
        <TabsList>
          <TabsTrigger value="policies">Políticas ({policies.length})</TabsTrigger>
          <TabsTrigger value="runs">Execuções ({runs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="mt-4">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
          ) : policies.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma cascata criada ainda. Clique em <b>Nova cascata</b> para começar.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {policies.map((p) => {
                const steps = (p.steps as CascadeStep[] | null) ?? [];
                return (
                  <Card key={p.id}>
                    <CardHeader className="flex flex-row items-start justify-between pb-2">
                      <div>
                        <CardTitle className="text-base">{p.name}</CardTitle>
                        {p.description && (
                          <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                        )}
                      </div>
                      <Badge variant={p.active ? "default" : "secondary"}>
                        {p.active ? "Ativa" : "Inativa"}
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <ol className="space-y-1 text-xs">
                        {steps.map((s, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                              {i + 1}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {CHANNEL_LABEL[s.channel_type]}
                            </Badge>
                            <span className="text-muted-foreground">
                              aguarda {s.wait_minutes}min
                            </span>
                          </li>
                        ))}
                      </ol>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditing({
                              id: p.id,
                              name: p.name,
                              description: p.description ?? "",
                              active: p.active,
                              steps,
                            });
                            setOpen(true);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Remover a cascata "${p.name}"?`)) delMut.mutate(p.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="runs" className="mt-4">
          {runs.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma execução ainda. Inicie uma cascata pelo card do lead.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-border/60">
                  {runs.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 p-3">
                      <Play className="h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <b>{(r.contact as { name?: string } | null)?.name ?? "Contato"}</b> ·{" "}
                          {(r.policy as { name?: string } | null)?.name ?? "?"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Passo {r.current_step + 1} · próximo em <ClientTime iso={r.run_at} />{" "}
                          {r.last_error && <span className="text-destructive">— {r.last_error}</span>}
                        </p>
                      </div>
                      <Badge
                        variant={
                          r.status === "running"
                            ? "default"
                            : r.status === "exhausted" || r.status === "delivered"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {r.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar cascata" : "Nova cascata"}</DialogTitle>
            <DialogDescription>
              Defina em que ordem os canais são tentados e quanto tempo esperar entre eles.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Nome</Label>
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Ex: Reengajamento pós-orçamento"
                  />
                </div>
                <div className="flex items-end justify-between gap-3 rounded-md border border-border p-2">
                  <Label>Ativa</Label>
                  <Switch
                    checked={editing.active}
                    onCheckedChange={(v) => setEditing({ ...editing, active: v })}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Descrição</Label>
                <Input
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Opcional"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Passos</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing({ ...editing, steps: [...editing.steps, emptyStep()] })}
                  >
                    <Plus className="mr-1 h-3 w-3" /> passo
                  </Button>
                </div>
                <div className="space-y-3">
                  {editing.steps.map((s, i) => (
                    <div key={i} className="grid gap-2 rounded-md border border-border p-3">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-semibold">Passo {i + 1}</span>
                        <div className="ml-auto flex items-center gap-2">
                          <Select
                            value={s.channel_type}
                            onValueChange={(v) => {
                              const st = [...editing.steps];
                              st[i] = { ...s, channel_type: v as CascadeStep["channel_type"] };
                              setEditing({ ...editing, steps: st });
                            }}
                          >
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="whatsapp">WhatsApp</SelectItem>
                              <SelectItem value="email">E-mail</SelectItem>
                              <SelectItem value="sms">SMS</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            className="h-8 w-24"
                            value={s.wait_minutes}
                            onChange={(e) => {
                              const st = [...editing.steps];
                              st[i] = { ...s, wait_minutes: Number(e.target.value) || 0 };
                              setEditing({ ...editing, steps: st });
                            }}
                          />
                          <span className="text-xs text-muted-foreground">min</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => {
                              const st = editing.steps.filter((_, j) => j !== i);
                              setEditing({ ...editing, steps: st });
                            }}
                            disabled={editing.steps.length <= 1}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      {s.channel_type === "email" && (
                        <Input
                          placeholder="Assunto do e-mail"
                          value={s.subject ?? ""}
                          onChange={(e) => {
                            const st = [...editing.steps];
                            st[i] = { ...s, subject: e.target.value };
                            setEditing({ ...editing, steps: st });
                          }}
                        />
                      )}
                      <Textarea
                        rows={3}
                        placeholder="Mensagem — use {{nome}} para personalizar"
                        value={s.message}
                        onChange={(e) => {
                          const st = [...editing.steps];
                          st[i] = { ...s, message: e.target.value };
                          setEditing({ ...editing, steps: st });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!editing) return;
                if (!editing.name.trim()) {
                  toast.error("Dê um nome à cascata");
                  return;
                }
                if (editing.steps.some((s) => !s.message.trim())) {
                  toast.error("Preencha a mensagem de cada passo");
                  return;
                }
                if (editing.id) {
                  updateMut.mutate({
                    id: editing.id,
                    name: editing.name,
                    description: editing.description || null,
                    active: editing.active,
                    steps: editing.steps,
                  });
                } else {
                  createMut.mutate({
                    name: editing.name,
                    description: editing.description || undefined,
                    active: editing.active,
                    steps: editing.steps,
                  });
                }
              }}
              disabled={createMut.isPending || updateMut.isPending}
            >
              {(createMut.isPending || updateMut.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
