import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Users, Send } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  createBroadcast,
  listChannelsForBroadcast,
  listTagsForBroadcast,
  previewAudience,
  scheduleBroadcast,
} from "@/lib/broadcasts.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CampaignWizard({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const create = useServerFn(createBroadcast);
  const schedule = useServerFn(scheduleBroadcast);
  const preview = useServerFn(previewAudience);
  const channelsFn = useServerFn(listChannelsForBroadcast);
  const tagsFn = useServerFn(listTagsForBroadcast);

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState<string>("");
  const [body, setBody] = useState("Olá {{nome}}! Temos uma novidade para você.");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [hasEmail, setHasEmail] = useState(false);
  const [lastDays, setLastDays] = useState<number>(90);
  const [useDaysFilter, setUseDaysFilter] = useState(false);
  const [scheduleNow, setScheduleNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [rate, setRate] = useState<number>(30);

  useEffect(() => {
    if (!open) {
      setStep(1); setName(""); setChannelId(""); setBody("Olá {{nome}}! Temos uma novidade para você.");
      setTagIds([]); setHasEmail(false); setLastDays(90); setUseDaysFilter(false);
      setScheduleNow(true); setScheduledAt(""); setRate(30);
    }
  }, [open]);

  const channels = useQuery({ queryKey: ["broadcast-channels"], queryFn: () => channelsFn(), enabled: open });
  const tags = useQuery({ queryKey: ["broadcast-tags"], queryFn: () => tagsFn(), enabled: open });

  const audienceFilter = useMemo(() => ({
    tagIds: tagIds.length ? tagIds : undefined,
    hasEmail: hasEmail || undefined,
    lastInteractionDays: useDaysFilter ? lastDays : undefined,
  }), [tagIds, hasEmail, useDaysFilter, lastDays]);

  const previewQ = useQuery({
    queryKey: ["broadcast-preview", audienceFilter],
    queryFn: () => preview({ data: audienceFilter }),
    enabled: open && step >= 3,
  });

  const samplePreview = body
    .replaceAll("{{nome}}", previewQ.data?.sample?.[0]?.name ?? "Ana")
    .replaceAll("{{name}}", previewQ.data?.sample?.[0]?.name ?? "Ana");

  const submit = useMutation({
    mutationFn: async () => {
      const created = await create({
        data: {
          name, channel_id: channelId, message_body: body,
          audience_filter: audienceFilter,
          scheduled_at: !scheduleNow && scheduledAt ? new Date(scheduledAt).toISOString() : null,
          rate_per_minute: rate,
        },
      });
      await schedule({ data: { id: created.id, startNow: scheduleNow } });
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
      toast.success(scheduleNow ? "Campanha iniciada" : "Campanha agendada");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canNext =
    (step === 1 && !!name && !!channelId) ||
    (step === 2 && body.trim().length > 0) ||
    (step === 3 && (previewQ.data?.count ?? 0) > 0) ||
    step === 4;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Nova campanha</SheetTitle>
          <div className="mt-2 flex items-center gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Básico</span><span>Mensagem</span><span>Audiência</span><span>Agendar</span>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-4 py-4">
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>Nome da campanha</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Black Friday - Leads Quentes" />
              </div>
              <div className="space-y-2">
                <Label>Canal de envio</Label>
                <Select value={channelId} onValueChange={setChannelId}>
                  <SelectTrigger><SelectValue placeholder="Selecione um canal" /></SelectTrigger>
                  <SelectContent>
                    {(channels.data ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.status !== "connected" && <span className="text-muted-foreground text-xs">(desconectado)</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escreva sua mensagem..." />
                <p className="text-xs text-muted-foreground">
                  Variáveis: <code>{`{{nome}}`}</code>, <code>{`{{telefone}}`}</code>, <code>{`{{email}}`}</code>
                </p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Pré-visualização</p>
                <div className="whitespace-pre-wrap rounded-md bg-background p-3 text-sm shadow-sm">{samplePreview}</div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="space-y-2">
                <Label>Tags (opcional)</Label>
                <div className="flex flex-wrap gap-2">
                  {(tags.data ?? []).map((t: any) => {
                    const active = tagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTagIds((s) => active ? s.filter((x) => x !== t.id) : [...s, t.id])}
                        className={`rounded-full border px-3 py-1 text-xs transition ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background"}`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                  {!tags.data?.length && <p className="text-xs text-muted-foreground">Nenhuma tag criada.</p>}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Apenas com email</p>
                  <p className="text-xs text-muted-foreground">Filtra contatos que possuem email cadastrado</p>
                </div>
                <Checkbox checked={hasEmail} onCheckedChange={(v) => setHasEmail(!!v)} />
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Interagiram nos últimos</p>
                  <Switch checked={useDaysFilter} onCheckedChange={setUseDaysFilter} />
                </div>
                {useDaysFilter && (
                  <div className="flex items-center gap-3">
                    <Slider value={[lastDays]} onValueChange={(v) => setLastDays(v[0])} min={1} max={365} step={1} className="flex-1" />
                    <span className="w-16 text-right text-sm">{lastDays} dias</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Contatos alvo</span>
                </div>
                <Badge variant="secondary" className="text-sm">
                  {previewQ.isLoading ? "..." : (previewQ.data?.count ?? 0).toLocaleString("pt-BR")}
                </Badge>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Enviar agora</p>
                  <p className="text-xs text-muted-foreground">Inicia imediatamente após confirmar</p>
                </div>
                <Switch checked={scheduleNow} onCheckedChange={setScheduleNow} />
              </div>
              {!scheduleNow && (
                <div className="space-y-2">
                  <Label>Data e hora</Label>
                  <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                </div>
              )}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Velocidade de envio</Label>
                  <span className="text-sm font-medium">{rate}/min</span>
                </div>
                <Slider value={[rate]} onValueChange={(v) => setRate(v[0])} min={1} max={120} step={1} />
                <p className="text-xs text-muted-foreground">Recomendado: 30/min para evitar bloqueios do WhatsApp.</p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-medium">Resumo</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <li>• {(previewQ.data?.count ?? 0).toLocaleString("pt-BR")} destinatários</li>
                  <li>• Canal: {channels.data?.find((c: any) => c.id === channelId)?.name}</li>
                  <li>• Ritmo: {rate} mensagens/minuto</li>
                  <li>• Tempo estimado: ~{Math.max(1, Math.ceil((previewQ.data?.count ?? 0) / rate))} min</li>
                </ul>
              </div>
            </>
          )}
        </div>

        <SheetFooter className="flex-row justify-between sm:justify-between">
          <Button variant="outline" onClick={() => step === 1 ? onOpenChange(false) : setStep(step - 1)}>
            {step === 1 ? "Cancelar" : "Voltar"}
          </Button>
          {step < 4 ? (
            <Button disabled={!canNext} onClick={() => setStep(step + 1)}>Avançar</Button>
          ) : (
            <Button disabled={submit.isPending || (previewQ.data?.count ?? 0) === 0} onClick={() => submit.mutate()}>
              {submit.isPending ? "Enviando..." : scheduleNow ? <><Send className="mr-1 h-4 w-4" /> Iniciar agora</> : <><Check className="mr-1 h-4 w-4" /> Agendar</>}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
