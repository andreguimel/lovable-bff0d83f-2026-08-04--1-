import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronRight, Filter, Plus, X } from "lucide-react";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createBroadcast,
  listChannelsForBroadcast,
  listTagsForBroadcast,
  previewAudience,
  scheduleBroadcast,
} from "@/lib/broadcasts.functions";
import { listFlows } from "@/lib/flows.functions";
import { cn } from "@/lib/utils";

const DELAY_PRESETS = [
  { key: "very_short", label: "Muito curto", range: "1-5s", min: 1, max: 5 },
  { key: "short", label: "Curto", range: "5-20s", min: 5, max: 20 },
  { key: "medium", label: "Médio", range: "20-50s", min: 20, max: 50 },
  { key: "long", label: "Longo", range: "50-120s", min: 50, max: 120 },
  { key: "very_long", label: "Muito longo", range: "120-300s", min: 120, max: 300 },
] as const;

type FilterKey =
  | "tag" | "phone" | "areaCode" | "name" | "origin" | "createdFrom" | "createdTo" | "lastInteractionDays";

const FILTER_DEFS: Array<{ key: FilterKey; label: string; enabled: boolean }> = [
  { key: "tag", label: "Etiqueta", enabled: true },
  { key: "phone", label: "Telefone", enabled: true },
  { key: "areaCode", label: "Código de Área", enabled: true },
  { key: "name", label: "Nome completo", enabled: true },
  { key: "origin", label: "Origem", enabled: true },
  { key: "createdFrom", label: "Data de inscrição (de)", enabled: true },
  { key: "createdTo", label: "Data de inscrição (até)", enabled: true },
  { key: "lastInteractionDays", label: "Última interação (dias)", enabled: true },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function TransmissionDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const create = useServerFn(createBroadcast);
  const schedule = useServerFn(scheduleBroadcast);
  const preview = useServerFn(previewAudience);
  const channelsFn = useServerFn(listChannelsForBroadcast);
  const tagsFn = useServerFn(listTagsForBroadcast);
  const flowsFn = useServerFn(listFlows);

  const [name, setName] = useState("");
  const [flowId, setFlowId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [description, setDescription] = useState("");
  const [delayMode, setDelayMode] = useState<"smart" | "manual">("smart");
  const [preset, setPreset] = useState<(typeof DELAY_PRESETS)[number]["key"]>("very_short");
  const [manualMin, setManualMin] = useState(5);
  const [manualMax, setManualMax] = useState(20);
  const [includePaused, setIncludePaused] = useState(false);
  const [filtersTogether, setFiltersTogether] = useState(true);
  const [active, setActive] = useState<Partial<Record<FilterKey, string>>>({});
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [showUsers, setShowUsers] = useState(false);
  const [scheduleLater, setScheduleLater] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");

  useEffect(() => {
    if (open) return;
    setName(""); setFlowId(""); setChannelId(""); setDescription("");
    setDelayMode("smart"); setPreset("very_short"); setManualMin(5); setManualMax(20);
    setIncludePaused(false); setFiltersTogether(true); setActive({}); setTagIds([]);
    setShowUsers(false); setScheduleLater(false); setScheduledAt("");
  }, [open]);

  const channels = useQuery({ queryKey: ["broadcast-channels"], queryFn: () => channelsFn(), enabled: open });
  const tags = useQuery({ queryKey: ["broadcast-tags"], queryFn: () => tagsFn(), enabled: open });
  const flows = useQuery({ queryKey: ["flows"], queryFn: () => flowsFn(), enabled: open });

  const publishedFlows = useMemo(
    () => (flows.data ?? []).filter((f: any) => f.status === "active"),
    [flows.data],
  );
  const activeChannels = useMemo(
    () => (channels.data ?? []).filter((c: any) => c.status === "connected"),
    [channels.data],
  );

  const audienceFilter = useMemo(() => {
    const num = (v?: string) => (v && !Number.isNaN(Number(v)) ? Number(v) : undefined);
    return {
      tagIds: tagIds.length ? tagIds : undefined,
      tagMode: filtersTogether ? ("and" as const) : ("or" as const),
      nameContains: active.name || undefined,
      phoneContains: active.phone || undefined,
      areaCode: active.areaCode || undefined,
      origin: active.origin || undefined,
      createdFrom: active.createdFrom || undefined,
      createdTo: active.createdTo || undefined,
      lastInteractionDays: num(active.lastInteractionDays),
      includePausedAutomation: includePaused,
    };
  }, [tagIds, filtersTogether, active, includePaused]);

  const previewQ = useQuery({
    queryKey: ["transmission-preview", audienceFilter],
    queryFn: () => preview({ data: audienceFilter }),
    enabled: open,
  });

  const usersQ = useQuery({
    queryKey: ["transmission-preview-users", audienceFilter],
    queryFn: () => preview({ data: { ...audienceFilter, sampleSize: 50 } }),
    enabled: open && showUsers,
  });

  const delay = useMemo(() => {
    if (delayMode === "manual") {
      const min = Math.max(1, manualMin);
      const max = Math.max(min, manualMax);
      return { mode: "manual" as const, min_seconds: min, max_seconds: max };
    }
    const p = DELAY_PRESETS.find((d) => d.key === preset)!;
    return { mode: "smart" as const, preset: p.key, min_seconds: p.min, max_seconds: p.max };
  }, [delayMode, preset, manualMin, manualMax]);

  const count = previewQ.data?.count ?? 0;
  const canSubmit =
    !!name.trim() && !!flowId && !!channelId && count > 0 && (!scheduleLater || !!scheduledAt);

  const submit = useMutation({
    mutationFn: async () => {
      const created = await create({
        data: {
          name: name.trim(),
          channel_id: channelId,
          flow_id: flowId,
          description: description.trim() || null,
          audience_filter: audienceFilter,
          delay,
          scheduled_at: scheduleLater && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        },
      });
      await schedule({ data: { id: created.id, startNow: !scheduleLater } });
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
      toast.success(scheduleLater ? "Transmissão agendada" : "Transmissão iniciada");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addFilter = (key: FilterKey) => setActive((s) => ({ ...s, [key]: s[key] ?? "" }));
  const removeFilter = (key: FilterKey) =>
    setActive((s) => {
      const next = { ...s };
      delete next[key];
      return next;
    });

  const activeKeys = Object.keys(active) as FilterKey[];
  const hasFilters = activeKeys.length > 0 || tagIds.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(1100px,96vw)] max-w-none overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Criar Transmissão</DialogTitle>
          <DialogDescription>
            Dispare um fluxo publicado para um público segmentado do seu CRM.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* -------- Configuração -------- */}
          <section className="rounded-xl border bg-muted/30 p-4">
            <h3 className="font-display text-base font-semibold">Configurações de Transmissão</h3>

            <div className="mt-4 space-y-2">
              <Label>Nome</Label>
              <Input
                value={name}
                maxLength={30}
                placeholder="Sem título"
                onChange={(e) => setName(e.target.value.slice(0, 30))}
              />
              <p className="text-right text-xs text-muted-foreground">{name.length}/30</p>
            </div>

            <div className="mt-2 space-y-2">
              <Label>Fluxo</Label>
              <Select value={flowId} onValueChange={setFlowId}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {publishedFlows.map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                  {publishedFlows.length === 0 && (
                    <div className="p-2 text-xs text-muted-foreground">Nenhum fluxo publicado</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-4 space-y-2">
              <Label>Canal</Label>
              <Select value={channelId} onValueChange={setChannelId}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {activeChannels.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                  {activeChannels.length === 0 && (
                    <div className="p-2 text-xs text-muted-foreground">Nenhum canal conectado</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-4 space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                placeholder="Objetivo desta transmissão"
              />
            </div>

            <div className="mt-4 space-y-3">
              <Label>Atraso</Label>
              <RadioGroup
                value={delayMode}
                onValueChange={(v) => setDelayMode(v as "smart" | "manual")}
                className="flex items-center gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="smart" id="delay-smart" />
                  <Label htmlFor="delay-smart" className="font-normal">Atraso inteligente</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="manual" id="delay-manual" />
                  <Label htmlFor="delay-manual" className="font-normal">Atraso manual</Label>
                </div>
              </RadioGroup>

              <p className="text-xs text-muted-foreground">
                Define o atraso de tempo com o qual sua transmissão funcionará. Quanto maior o atraso,
                menos provável que sua transmissão seja confundida com spam, mas transmissões grandes
                podem levar muito tempo.
              </p>

              {delayMode === "smart" ? (
                <RadioGroup
                  value={preset}
                  onValueChange={(v) => setPreset(v as typeof preset)}
                  className="space-y-1"
                >
                  {DELAY_PRESETS.map((d) => (
                    <div key={d.key} className="flex items-center gap-2">
                      <RadioGroupItem value={d.key} id={`delay-${d.key}`} />
                      <Label htmlFor={`delay-${d.key}`} className="font-normal">
                        {d.label} <span className="text-muted-foreground">{d.range}</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Mín (s)</Label>
                    <Input
                      type="number" min={1} className="w-24"
                      value={manualMin}
                      onChange={(e) => setManualMin(Number(e.target.value) || 1)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Máx (s)</Label>
                    <Input
                      type="number" min={1} className="w-24"
                      value={manualMax}
                      onChange={(e) => setManualMax(Number(e.target.value) || 1)}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* -------- Segmentação -------- */}
          <section className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold">Segmentação</h3>
                <p className="text-sm text-muted-foreground">
                  Usuários que receberão esta transmissão:{" "}
                  <b className="text-foreground">
                    {previewQ.isFetching ? "…" : count.toLocaleString("pt-BR")}
                  </b>
                </p>
              </div>
              <Button variant="link" className="h-auto p-0" onClick={() => setShowUsers((v) => !v)}>
                {showUsers ? "Ocultar usuários" : "Mostrar usuários"}
              </Button>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Switch checked={includePaused} onCheckedChange={setIncludePaused} id="paused-automation" />
              <Label htmlFor="paused-automation" className="font-normal">
                Enviar para contatos com automação pausada
              </Label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="border-dashed">
                    <Filter className="mr-1 h-4 w-4" /> Filtros <Plus className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-1">
                  <p className="px-2 py-1 text-[10px] uppercase text-muted-foreground">Adicionar filtros</p>
                  {FILTER_DEFS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => addFilter(f.key)}
                      className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-accent"
                    >
                      {f.label}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                  <div className="mt-1 border-t px-2 py-2 text-[11px] text-muted-foreground">
                    Sequência e Campanha chegam em breve.
                  </div>
                </PopoverContent>
              </Popover>

              <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5">
                <span className="text-sm">Aplicar filtros juntos</span>
                <Switch checked={filtersTogether} onCheckedChange={setFiltersTogether} />
              </div>

              {hasFilters && (
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => { setActive({}); setTagIds([]); }}
                >
                  Redefinir tudo <X className="ml-1 h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Etiquetas */}
            {active.tag !== undefined && (
              <div className="mt-3 rounded-lg border bg-background p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase text-muted-foreground">Etiqueta</span>
                  <button type="button" onClick={() => { removeFilter("tag"); setTagIds([]); }}>
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(tags.data ?? []).map((t: any) => {
                    const on = tagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() =>
                          setTagIds((s) => (on ? s.filter((x) => x !== t.id) : [...s, t.id]))
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition",
                          on ? "border-primary bg-primary/10 text-primary" : "border-border",
                        )}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                  {!tags.data?.length && (
                    <p className="text-xs text-muted-foreground">Nenhuma etiqueta criada.</p>
                  )}
                </div>
              </div>
            )}

            {/* Demais filtros */}
            <div className="mt-3 space-y-2">
              {activeKeys.filter((k) => k !== "tag").map((k) => {
                const def = FILTER_DEFS.find((f) => f.key === k)!;
                const isDate = k === "createdFrom" || k === "createdTo";
                const isNumber = k === "lastInteractionDays";
                return (
                  <div key={k} className="flex items-center gap-2 rounded-lg border bg-background p-2">
                    <span className="w-44 shrink-0 text-xs text-muted-foreground">{def.label}</span>
                    <Input
                      className="h-9"
                      type={isDate ? "date" : isNumber ? "number" : "text"}
                      value={active[k] ?? ""}
                      onChange={(e) => setActive((s) => ({ ...s, [k]: e.target.value }))}
                    />
                    <button type="button" onClick={() => removeFilter(k)}>
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                );
              })}
              {!hasFilters && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Adicionar filtros para refinar seu público
                </p>
              )}
            </div>

            {showUsers && (
              <div className="mt-4 rounded-lg border bg-background">
                <p className="border-b px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                  Prévia dos destinatários
                </p>
                <ScrollArea className="h-56">
                  {usersQ.isLoading ? (
                    <div className="space-y-2 p-3">
                      {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : (usersQ.data?.sample ?? []).length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">Nenhum contato encontrado.</p>
                  ) : (
                    <ul className="divide-y">
                      {(usersQ.data?.sample ?? []).map((c: any) => (
                        <li key={c.id} className="px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium">{c.name || "Sem nome"}</span>
                            <span className="text-xs text-muted-foreground">{c.phone}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                            {c.channel_name && <Badge variant="secondary">{c.channel_name}</Badge>}
                            {c.owner_name && <Badge variant="outline">{c.owner_name}</Badge>}
                            {(c.tags ?? []).map((t: any) => (
                              <Badge key={t.id} variant="outline">{t.name}</Badge>
                            ))}
                            {c.last_interaction_at && (
                              <span>
                                última interação:{" "}
                                {new Date(c.last_interaction_at).toLocaleDateString("pt-BR")}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="schedule-later"
                checked={scheduleLater}
                onCheckedChange={(v) => setScheduleLater(!!v)}
              />
              <Label htmlFor="schedule-later" className="font-normal">Definir hora e executar depois</Label>
            </div>
            {scheduleLater && (
              <Input
                type="datetime-local"
                className="w-56"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            )}
          </div>
          <Button
            size="lg"
            disabled={!canSubmit || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending
              ? "Processando…"
              : scheduleLater ? "Iniciar agendamento" : "Iniciar agora"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
