/**
 * FB-04 — Renderer universal de campos.
 *
 * Nenhum bloco importa Input/Select/Textarea/Switch/MediaPicker diretamente
 * no seu Inspector. Tudo passa por este renderer, garantindo consistência
 * visual, foco no autofill e um único ponto para futuras evoluções
 * (busca de propriedades, comandos, IA sugerindo valores etc.).
 */
import { AlertTriangle, Info, Plus, Trash2, ArrowUp, ArrowDown, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { MediaPicker, type MediaKind } from "@/components/flows/media-picker";
import { BLOCKS, type NodeKind } from "@/components/flows/studio/blocks";
import type { ActionItem, ButtonItem } from "@/components/flows/studio/custom-node";
import { isEmpty, type FieldSpec, type SidebarCtx } from "./types";
export { makeErrorLookup } from "./validation";

const PRESET_VARIABLES = [
  {
    group: "Dados do Contato",
    items: [
      { value: "contact.name", label: "👤 Nome do Contato (contact.name)" },
      { value: "contact.phone", label: "📱 Telefone (contact.phone)" },
      { value: "contact.email", label: "✉️ E-mail (contact.email)" },
      { value: "contact.tags", label: "🏷️ Etiquetas (contact.tags)" },
    ],
  },
  {
    group: "Mensagens & Respostas",
    items: [
      { value: "last_message", label: "💬 Última Mensagem do Contato (last_message)" },
      { value: "reply", label: "✏️ Resposta da Pergunta Anterior (reply)" },
      { value: "ai.output", label: "🤖 Resposta do Agente IA (ai.output)" },
    ],
  },
  {
    group: "Integrações & Webhooks",
    items: [
      { value: "http.status", label: "🌐 Status HTTP (http.status)" },
      { value: "http.body", label: "📦 Resposta do Webhook (http.body)" },
    ],
  },
];

function VariableSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const isPreset = PRESET_VARIABLES.some((g) =>
    g.items.some((i) => i.value === value)
  );
  const [isCustom, setIsCustom] = useState(!isPreset && value !== "");

  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">Campo ou Variável</Label>
      {!isCustom ? (
        <Select
          value={isPreset ? value : ""}
          onValueChange={(val) => {
            if (val === "__custom__") {
              setIsCustom(true);
            } else {
              onChange(val);
            }
          }}
        >
          <SelectTrigger className="h-7 text-xs bg-background">
            <SelectValue placeholder="Selecione uma variável disponível..." />
          </SelectTrigger>
          <SelectContent>
            {PRESET_VARIABLES.map((group) => (
              <SelectGroup key={group.group}>
                <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1">
                  {group.group}
                </SelectLabel>
                {group.items.map((item) => (
                  <SelectItem key={item.value} value={item.value} className="text-xs">
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
            <SelectGroup>
              <SelectItem value="__custom__" className="text-xs text-primary font-medium">
                ✍️ Digitar variável personalizada...
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        <div className="flex gap-1.5">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="ex: contact.cpf, http.body.user.id"
            className="h-7 text-xs font-mono bg-background flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[10px]"
            onClick={() => setIsCustom(false)}
          >
            Lista
          </Button>
        </div>
      )}
    </div>
  );
}


interface Props {
  field: FieldSpec;
  data: Record<string, unknown>;
  ctx: SidebarCtx;
  errorFor: (path: string) => string | null;
  onChange: (patch: Record<string, unknown>) => void;
}

export function FieldRenderer({ field, data, ctx, errorFor, onChange }: Props) {
  if (field.visible && !field.visible(data, ctx)) return null;

  switch (field.type) {
    case "info": {
      const isWarn = field.variant === "warning";
      const Icon = isWarn ? AlertTriangle : Info;
      return (
        <p
          className={
            "flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[11px] " +
            (isWarn
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-border/60 bg-muted/40 text-muted-foreground")
          }
        >
          <Icon className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{field.text}</span>
        </p>
      );
    }

    case "text": {
      const err = errorFor(field.key);
      const value = typeof data[field.key] === "string" ? (data[field.key] as string) : "";
      return (
        <FieldWrap label={field.label} help={field.help} error={err} required={field.required}>
          <Input
            id={`f-${field.key}`}
            value={value}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            onChange={(e) => onChange({ [field.key]: e.target.value })}
            className={"h-8 " + (field.mono ? "font-mono text-xs" : "")}
            aria-invalid={!!err}
          />
        </FieldWrap>
      );
    }

    case "textarea": {
      const err = errorFor(field.key);
      const value = typeof data[field.key] === "string" ? (data[field.key] as string) : "";
      return (
        <FieldWrap label={field.label} help={field.help} error={err} required={field.required}>
          <Textarea
            id={`f-${field.key}`}
            rows={field.rows ?? 4}
            value={value}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            onChange={(e) => onChange({ [field.key]: e.target.value })}
            className="resize-none text-sm"
            aria-invalid={!!err}
          />
        </FieldWrap>
      );
    }

    case "number": {
      const err = errorFor(field.key);
      const raw = data[field.key];
      const value = typeof raw === "number" ? String(raw) : "";
      return (
        <FieldWrap label={field.label} help={field.help} error={err} required={field.required}>
          <div className="relative">
            <Input
              id={`f-${field.key}`}
              type="number"
              inputMode="numeric"
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              value={value}
              placeholder={field.placeholder}
              onChange={(e) => {
                const n = e.target.value === "" ? undefined : Number(e.target.value);
                onChange({ [field.key]: Number.isFinite(n) ? n : undefined });
              }}
              className={"h-8 " + (field.suffix ? "pr-8" : "")}
              aria-invalid={!!err}
            />
            {field.suffix && (
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                {field.suffix}
              </span>
            )}
          </div>
        </FieldWrap>
      );
    }

    case "select": {
      const err = errorFor(field.key);
      const options = typeof field.options === "function" ? field.options(ctx) : field.options;
      const value = typeof data[field.key] === "string" ? (data[field.key] as string) : "";
      const onSelect = (v: string) => {
        const patch: Record<string, unknown> = { [field.key]: v };
        // FB-06 — persiste o rótulo humano ao lado do valor, para preview do card
        if (field.persistLabelKey) {
          const opt = options.find((o) => o.value === v);
          patch[field.persistLabelKey] = opt?.label ?? v;
        }
        onChange(patch);
      };
      return (
        <FieldWrap label={field.label} help={field.help} error={err} required={field.required}>
          <Select value={value} onValueChange={onSelect}>
            <SelectTrigger className="h-8" aria-invalid={!!err}>
              <SelectValue placeholder={field.placeholder ?? "Selecione…"} />
            </SelectTrigger>
            <SelectContent>
              {options.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {field.emptyMessage ?? "Nenhuma opção disponível."}
                </div>
              ) : (
                options.map((o) => (
                  <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                    {o.label}
                    {o.hint ? (
                      <span className="ml-1 text-[10px] text-muted-foreground">{o.hint}</span>
                    ) : null}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </FieldWrap>
      );
    }


    case "switch": {
      const checked = !!data[field.key];
      return (
        <div className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-medium">{field.label}</p>
            {field.description && (
              <p className="text-[10px] text-muted-foreground">{field.description}</p>
            )}
          </div>
          <Switch
            checked={checked}
            onCheckedChange={(v) => onChange({ [field.key]: v })}
          />
        </div>
      );
    }

    case "duration": {
      const err = errorFor(field.key);
      const raw = data[field.key];
      const value = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : "";
      const unit = typeof data[field.unitKey] === "string" ? (data[field.unitKey] as string) : "days";
      const units = [
        { value: "seconds", label: "Segundos" },
        { value: "minutes", label: "Minutos" },
        { value: "hours", label: "Horas" },
        { value: "days", label: "Dias" },
      ];
      return (
        <FieldWrap label={field.label} help={field.help} error={err}>
          <div className="flex items-center gap-2">
            <Input
              id={`f-${field.key}`}
              type="number"
              inputMode="numeric"
              min={field.min ?? 1}
              max={field.max}
              step={1}
              value={value}
              placeholder={field.clearable ? "sem expiração" : "1"}
              onChange={(e) => {
                const n = e.target.value === "" ? undefined : Number(e.target.value);
                onChange({ [field.key]: Number.isFinite(n) ? n : undefined });
              }}
              className="h-8 w-24"
              aria-invalid={!!err}
            />
            <Select value={unit} onValueChange={(v) => onChange({ [field.unitKey]: v })}>
              <SelectTrigger className="h-8 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FieldWrap>
      );
    }

    case "radio": {

      const err = errorFor(field.key);
      const value = typeof data[field.key] === "string" ? (data[field.key] as string) : "";
      return (
        <FieldWrap label={field.label} help={field.help} error={err} required={field.required}>
          <div className="grid gap-1.5" role="radiogroup" aria-invalid={!!err}>
            {field.options.map((o) => {
              const selected = value === o.value;
              return (
                <label
                  key={o.value}
                  className={
                    "flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs transition " +
                    (selected
                      ? "border-primary/60 bg-primary/5"
                      : "border-border/60 bg-card/40 hover:border-border")
                  }
                >
                  <input
                    type="radio"
                    name={`f-${field.key}`}
                    className="mt-0.5 h-3 w-3 accent-primary"
                    checked={selected}
                    disabled={o.disabled}
                    onChange={() => onChange({ [field.key]: o.value })}
                  />
                  <span className="min-w-0 leading-snug">
                    {o.label}
                    {o.hint ? (
                      <span className="ml-1 text-[10px] text-muted-foreground">{o.hint}</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </FieldWrap>
      );
    }



    case "media": {
      return (
        <div className="grid gap-2">
          {field.label && (
            <Label className="text-[11px] text-muted-foreground">{field.label}</Label>
          )}
          <MediaPicker
            kind={field.mediaKind}
            flowId={ctx.flowId}
            value={{
              url: typeof data.media_url === "string" ? data.media_url : undefined,
              filename:
                typeof data.media_filename === "string" ? data.media_filename : undefined,
              mime_type:
                typeof data.media_mime === "string" ? data.media_mime : undefined,
              size: typeof data.media_size === "number" ? data.media_size : undefined,
            }}
            onChange={(v) =>
              onChange({
                media_url: v.url,
                media_filename: v.filename,
                media_mime: v.mime_type,
                media_size: v.size,
              })
            }
          />
          {field.withCaption && (
            <FieldWrap label="Legenda (opcional)">
              <Textarea
                rows={2}
                value={typeof data.caption === "string" ? (data.caption as string) : ""}
                placeholder="Texto que acompanha a mídia."
                onChange={(e) => onChange({ caption: e.target.value })}
                className="resize-none text-sm"
              />
            </FieldWrap>
          )}
        </div>
      );
    }

    case "menu_options": {
      const min = field.min ?? 2;
      const max = field.max ?? 10;
      const raw = Array.isArray(data[field.key]) ? (data[field.key] as unknown[]) : [];
      const options = raw
        .map((o) => (o && typeof o === "object" ? (o as { id?: unknown; label?: unknown }) : null))
        .filter(Boolean)
        .map((o) => ({
          id: typeof o!.id === "string" && o!.id ? o!.id : makeOptionId(),
          label: typeof o!.label === "string" ? o!.label : "",
        }));
      const err = errorFor(field.key);
      const update = (next: Array<{ id: string; label: string }>) =>
        onChange({ [field.key]: next });
      return (
        <FieldWrap label={field.label ?? "Opções do menu"} error={err} required>
          <div className="grid gap-1.5">
            {options.length === 0 && (
              <p className="rounded-md border border-dashed border-border/60 px-2 py-3 text-center text-[11px] text-muted-foreground">
                Nenhuma opção. Adicione pelo menos {min} para que o menu funcione.
              </p>
            )}
            {options.map((opt, idx) => (
              <div key={opt.id} className="flex items-center gap-1.5">
                <span className="flex h-8 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-[10px] font-medium text-muted-foreground">
                  {idx + 1}
                </span>
                <Input
                  className="h-8 text-xs"
                  value={opt.label}
                  placeholder={`Opção ${idx + 1}`}
                  maxLength={60}
                  onChange={(e) => {
                    const next = options.slice();
                    next[idx] = { ...opt, label: e.target.value };
                    update(next);
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  disabled={options.length <= min}
                  title={
                    options.length <= min
                      ? `O menu precisa de pelo menos ${min} opções.`
                      : "Remover opção"
                  }
                  onClick={() => update(options.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={options.length >= max}
              onClick={() => update([...options, { id: makeOptionId(), label: "" }])}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Adicionar opção
            </Button>
            <p className="text-[10px] text-muted-foreground">
              O contato responde com o número da opção (1 a {options.length || max}) ou o
              texto exato. Cada opção vira uma saída no bloco.
            </p>
          </div>
        </FieldWrap>
      );
    }

    case "randomizer_routes": {
      const min = field.min ?? 2;
      const max = field.max ?? 10;
      const raw = Array.isArray(data[field.key]) ? (data[field.key] as unknown[]) : [];
      const routes = raw
        .map((r) => (r && typeof r === "object" ? (r as { id?: unknown; label?: unknown; weight?: unknown }) : null))
        .filter(Boolean)
        .map((r, idx) => ({
          id: typeof r!.id === "string" && r!.id ? r!.id : makeRouteId(),
          label: typeof r!.label === "string" ? r!.label : `Caminho ${String.fromCharCode(65 + idx)}`,
          weight: typeof r!.weight === "number" && Number.isFinite(r!.weight) ? r!.weight : 0,
        }));
      const err = errorFor(field.key);
      const total = routes.reduce((acc, r) => acc + (r.weight || 0), 0);
      const totalOk = total === 100;
      const update = (next: Array<{ id: string; label: string; weight: number }>) =>
        onChange({ [field.key]: next });
      return (
        <FieldWrap label={field.label ?? "Caminhos"} error={err} required>
          <div className="grid gap-1.5">
            {routes.length === 0 && (
              <p className="rounded-md border border-dashed border-border/60 px-2 py-3 text-center text-[11px] text-muted-foreground">
                Nenhum caminho configurado. Adicione ao menos {min}.
              </p>
            )}
            {routes.map((route, idx) => (
              <div key={route.id} className="flex items-center gap-1.5">
                <span className="flex h-8 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-[10px] font-medium text-muted-foreground">
                  {idx + 1}
                </span>
                <Input
                  className="h-8 flex-1 text-xs"
                  value={route.label}
                  placeholder={`Caminho ${String.fromCharCode(65 + idx)}`}
                  maxLength={40}
                  onChange={(e) => {
                    const next = routes.slice();
                    next[idx] = { ...route, label: e.target.value };
                    update(next);
                  }}
                />
                <div className="relative w-20">
                  <Input
                    className="h-8 pr-6 text-right text-xs"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    step={1}
                    value={String(route.weight)}
                    onChange={(e) => {
                      const v = e.target.value === "" ? 0 : Number(e.target.value);
                      const next = routes.slice();
                      next[idx] = { ...route, weight: Number.isFinite(v) ? v : 0 };
                      update(next);
                    }}
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                    %
                  </span>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  disabled={routes.length <= min}
                  title={
                    routes.length <= min
                      ? `O randomizador precisa de pelo menos ${min} caminhos.`
                      : "Remover caminho"
                  }
                  onClick={() => update(routes.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={routes.length >= max}
              onClick={() =>
                update([
                  ...routes,
                  { id: makeRouteId(), label: `Caminho ${String.fromCharCode(65 + routes.length)}`, weight: 0 },
                ])
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Adicionar caminho
            </Button>
            <div
              className={
                "flex items-center justify-between rounded-md border px-2 py-1 text-[11px] " +
                (totalOk
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300")
              }
            >
              <span>Total dos caminhos</span>
              <span className="font-semibold">{total}%</span>
            </div>
            {!totalOk && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                Os percentuais precisam somar 100%.
              </p>
            )}
          </div>
        </FieldWrap>
      );
    }

    case "condition_builder": {
      return (
        <ConditionBuilderField
          data={data}
          ctx={ctx}
          onChange={onChange}
        />
      );
    }

    case "content_builder": {
      return (
        <ContentBuilderField
          data={data}
          ctx={ctx}
          onChange={onChange}
        />
      );
    }
  }
}

function ConditionBuilderField({
  data,
  ctx,
  onChange,
}: {
  data: Record<string, unknown>;
  ctx: SidebarCtx;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const conditions = Array.isArray(data.conditions) ? (data.conditions as any[]) : [];
  const logic = (data.logic as string) || "ALL";

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground leading-relaxed">
        Defina as condições e regra lógica para que o fluxo continue pela saída superior deste bloco:
      </p>

      {/* SELEÇÃO DE LÓGICA: TODAS (E) / QUALQUER (OU) */}
      <div className="space-y-2.5">
        <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-foreground">
          <input
            type="radio"
            name="condition_logic"
            checked={logic === "ALL"}
            onChange={() => onChange({ logic: "ALL" })}
            className="text-primary focus:ring-primary h-4 w-4"
          />
          <span>Contato corresponde a <b>TODAS</b> condições</span>
        </label>
        <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-foreground">
          <input
            type="radio"
            name="condition_logic"
            checked={logic === "ANY"}
            onChange={() => onChange({ logic: "ANY" })}
            className="text-primary focus:ring-primary h-4 w-4"
          />
          <span>Contato corresponde a <b>QUALQUER</b> condição</span>
        </label>
      </div>

      {/* LÓGICA ATIVA SUBTITLE (ESTILO BOTCONVERSA) */}
      <div className="text-xs font-bold text-foreground pt-1">
        {logic === "ALL" ? "Lógica E" : "Lógica OU"}
      </div>

      {/* CARDS DE CONDIÇÕES CONFIGURADAS */}
      {conditions.length > 0 && (
        <div className="space-y-2.5">
          {conditions.map((c: any, cIdx: number) => {
            const updateRule = (patch: Record<string, any>) => {
              const cur = [...conditions];
              cur[cIdx] = { ...cur[cIdx], ...patch };
              onChange({ conditions: cur });
            };

            const removeRule = () => {
              const cur = conditions.filter((_, i) => i !== cIdx);
              onChange({ conditions: cur });
            };

            return (
              <div
                key={c.id || cIdx}
                className="rounded-xl border border-primary/30 bg-primary/5 dark:bg-card/80 p-3.5 space-y-1.5 text-xs relative"
              >
                <button
                  type="button"
                  onClick={removeRule}
                  className="absolute top-2.5 right-2.5 p-1 text-muted-foreground hover:text-destructive rounded"
                  title="Remover condição"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>

                <div className="font-semibold text-foreground text-xs pr-6">
                  {c.type === "tag" && "Etiqueta"}
                  {c.type === "weekday" && "Dia da Semana ao passar por aqui"}
                  {c.type === "business_hours" && "In opening hours when passing by here"}
                  {c.type === "time_window" && "Hora ao passar por aqui"}
                  {c.type === "assigned_agent" && "Atendimento está atribuído para um atendente"}
                  {c.type === "custom_field" && (c.field || "Campo do contato ou variável")}
                </div>

                <div className="text-[11px] font-medium text-muted-foreground uppercase">
                  {c.type === "tag" ? (c.tag_operator === "has_not" ? "NÃO É" : "É") : "É"}
                </div>

                <div className="font-semibold text-foreground text-xs pt-0.5">
                  {c.type === "business_hours" && (
                    <Select
                      value={c.business_hours_operator || "open"}
                      onValueChange={(v) => updateRule({ business_hours_operator: v })}
                    >
                      <SelectTrigger className="h-7 text-xs bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Aberto</SelectItem>
                        <SelectItem value="closed">Fechado</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {c.type === "tag" && (
                    <Input
                      value={c.tag_name || ""}
                      onChange={(e) => updateRule({ tag_name: e.target.value })}
                      placeholder="Nome da etiqueta (ex: VIP)"
                      className="h-7 text-xs bg-background"
                    />
                  )}

                  {c.type === "weekday" && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {[
                        { id: 1, label: "Seg" },
                        { id: 2, label: "Ter" },
                        { id: 3, label: "Qua" },
                        { id: 4, label: "Qui" },
                        { id: 5, label: "Sex" },
                        { id: 6, label: "Sáb" },
                        { id: 0, label: "Dom" },
                      ].map((day) => {
                        const active = (c.weekdays || []).includes(day.id);
                        return (
                          <button
                            key={day.id}
                            type="button"
                            onClick={() => {
                              const curDays = c.weekdays || [];
                              const nextDays = active
                                ? curDays.filter((d: number) => d !== day.id)
                                : [...curDays, day.id];
                              updateRule({ weekdays: nextDays });
                            }}
                            className={`px-2 py-0.5 text-[10px] rounded font-medium border ${
                              active
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-muted-foreground border-border/50"
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {c.type === "time_window" && (
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="time"
                        value={c.start_time || "08:00"}
                        onChange={(e) => updateRule({ start_time: e.target.value })}
                        className="h-7 text-xs bg-background"
                      />
                      <Input
                        type="time"
                        value={c.end_time || "18:00"}
                        onChange={(e) => updateRule({ end_time: e.target.value })}
                        className="h-7 text-xs bg-background"
                      />
                    </div>
                  )}

                  {c.type === "assigned_agent" && (
                    <Select
                      value={c.agent_user_id || ""}
                      onValueChange={(v) => {
                        const ag = (ctx.agents || []).find((a) => a.id === v);
                        updateRule({ agent_user_id: v, agent_user_name: ag?.name || "" });
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs bg-background">
                        <SelectValue placeholder="Selecione um atendente..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(ctx.agents || []).map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {c.type === "custom_field" && (
                    <div className="space-y-1.5 pt-1">
                      <VariableSelect
                        value={c.field || ""}
                        onChange={(v) => updateRule({ field: v })}
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <Select
                          value={c.operator || "equals"}
                          onValueChange={(v) => updateRule({ operator: v })}
                        >
                          <SelectTrigger className="h-7 text-xs bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">é igual a</SelectItem>
                            <SelectItem value="not_equals">é diferente de</SelectItem>
                            <SelectItem value="contains">contém</SelectItem>
                            <SelectItem value="not_contains">não contém</SelectItem>
                            <SelectItem value="exists">existe</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={c.value || ""}
                          onChange={(e) => updateRule({ value: e.target.value })}
                          placeholder="Valor..."
                          className="h-7 text-xs bg-background"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DROPDOWN SELECTOR */}
      <div className="pt-1">
        <Select
          onValueChange={(val) => {
            const cur = [...conditions];
            const type = val as any;
            const newRule: any = {
              id: String(Date.now() + Math.random()),
              type,
              tag_operator: "has",
              business_hours_operator: "open",
              start_time: "08:00",
              end_time: "18:00",
              weekdays: [1, 2, 3, 4, 5],
              field: "contact.name",
              operator: "equals",
              value: "",
            };
            onChange({ conditions: [...cur, newRule] });
          }}
        >
          <SelectTrigger className="h-10 text-xs w-full justify-between border-primary/40 bg-background text-foreground font-medium rounded-lg shadow-sm">
            <SelectValue placeholder="Selecionar Condição" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1.5">
                OPERAÇÕES MAIS USADAS
              </SelectLabel>
              <SelectItem value="tag" className="text-xs">Etiqueta</SelectItem>
              <SelectItem value="weekday" className="text-xs">Dia da Semana ao passar por aqui</SelectItem>
              <SelectItem value="business_hours" className="text-xs">Horário de Atendimento</SelectItem>
              <SelectItem value="time_window" className="text-xs">Hora ao passar por aqui</SelectItem>
              <SelectItem value="assigned_agent" className="text-xs">Atendimento está atribuído para um atendente</SelectItem>
              <SelectItem value="custom_field" className="text-xs">Campo do contato ou variável</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function makeRouteId(): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `route_${rnd}`;
}

function makeOptionId(): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `opt_${rnd}`;
}

function FieldWrap({
  label,
  help,
  error,
  required,
  children,
}: {
  label?: string;
  help?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      {label && (
        <Label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-[10px] text-destructive">
          <AlertTriangle className="h-3 w-3" /> {error}
        </p>
      ) : help ? (
        <p className="text-[10px] text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

function ContentBuilderField({
  data,
  ctx,
  onChange,
}: {
  data: Record<string, unknown>;
  ctx: SidebarCtx;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const actions: ActionItem[] = Array.isArray(data.actions) ? (data.actions as any[]) : [];
  const buttons: ButtonItem[] = Array.isArray(data.buttons) ? (data.buttons as any[]) : [];
  const [openActionIndex, setOpenActionIndex] = useState<number | null>(actions.length > 0 ? 0 : null);

  const addAction = (kind: NodeKind) => {
    const actMeta = BLOCKS[kind] ?? BLOCKS.message;
    const newAct: ActionItem = {
      id: String(Date.now() + Math.random()),
      kind,
      label: actMeta.label,
      body: kind === "message" ? "" : undefined,
      seconds: kind === "wait" ? 5 : undefined,
    };
    onChange({ actions: [...actions, newAct] });
    setOpenActionIndex(actions.length);
  };

  const updateAction = (index: number, patch: Partial<ActionItem>) => {
    const nextActions = [...actions];
    nextActions[index] = { ...nextActions[index], ...patch };
    onChange({ actions: nextActions });
  };

  const moveAction = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= actions.length) return;
    const nextActions = [...actions];
    const temp = nextActions[index];
    nextActions[index] = nextActions[targetIndex];
    nextActions[targetIndex] = temp;
    onChange({ actions: nextActions });
    setOpenActionIndex(targetIndex);
  };

  const removeAction = (index: number) => {
    const nextActions = actions.filter((_, i) => i !== index);
    onChange({ actions: nextActions });
    setOpenActionIndex(null);
  };

  return (
    <div className="space-y-4">
      {/* SUB-AÇÕES EMPILHADAS (BOTCONVERSA STYLE) */}
      <div className="space-y-2 border-t border-border/60 pt-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Layers className="h-3.5 w-3.5 text-primary" />
            Funções do Bloco ({actions.length})
          </span>
          <Select onValueChange={(val) => addAction(val as NodeKind)}>
            <SelectTrigger className="h-7 text-[11px] px-2 w-auto gap-1">
              <Plus className="h-3 w-3" />
              <span>Adicionar Função</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="message">💬 Enviar mensagem (Texto)</SelectItem>
              <SelectItem value="send_image">🖼️ Enviar imagem</SelectItem>
              <SelectItem value="send_audio">🎵 Enviar áudio</SelectItem>
              <SelectItem value="send_video">🎥 Enviar vídeo</SelectItem>
              <SelectItem value="send_document">📄 Enviar arquivo</SelectItem>
              <SelectItem value="tag">🏷️ Aplicar tag</SelectItem>
              <SelectItem value="assign_agent">👤 Atribuir atendente</SelectItem>
              <SelectItem value="wait">⏱️ Aguardar tempo (Delay)</SelectItem>
              <SelectItem value="webhook">🔔 Disparar Webhook</SelectItem>
              <SelectItem value="http_request">🌐 Requisição HTTP</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {actions.length > 0 ? (
          <div className="space-y-2 mt-2">
            {actions.map((act, idx) => {
              const actMeta = BLOCKS[act.kind] ?? BLOCKS.message;
              const ActIcon = actMeta.icon;
              const isOpen = openActionIndex === idx;
              const actMediaKind: MediaKind | null =
                act.kind === "send_image"
                  ? "image"
                  : act.kind === "send_audio"
                    ? "audio"
                    : act.kind === "send_video"
                      ? "video"
                      : act.kind === "send_document"
                        ? "document"
                        : null;

              return (
                <div
                  key={act.id || idx}
                  className="rounded-lg border border-border/70 bg-card/60 overflow-hidden text-xs"
                >
                  <div
                    className="flex items-center justify-between px-3 py-2 bg-muted/40 cursor-pointer select-none hover:bg-muted/70"
                    onClick={() => setOpenActionIndex(isOpen ? null : idx)}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-mono text-[10px] text-muted-foreground">{idx + 1}.</span>
                      <ActIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="font-medium truncate text-foreground">{act.label || actMeta.label}</span>
                    </div>

                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveAction(idx, "up")}
                        className="p-1 rounded text-muted-foreground hover:bg-background disabled:opacity-30"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === actions.length - 1}
                        onClick={() => moveAction(idx, "down")}
                        className="p-1 rounded text-muted-foreground hover:bg-background disabled:opacity-30"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAction(idx)}
                        className="p-1 rounded text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="p-3 space-y-3 bg-background/40 border-t border-border/40">
                      {act.kind === "message" && (
                        <div className="grid gap-1.5">
                          <Label className="text-[10px] text-muted-foreground">Mensagem de Texto</Label>
                          <Textarea
                            rows={3}
                            value={act.body || ""}
                            onChange={(e) => updateAction(idx, { body: e.target.value })}
                            placeholder="Texto da mensagem…"
                            className="resize-none text-xs"
                          />
                        </div>
                      )}

                      {actMediaKind && (
                        <div className="space-y-2">
                          <MediaPicker
                            kind={actMediaKind}
                            flowId={ctx.flowId}
                            value={{
                              url: act.media_url,
                              filename: act.media_filename,
                              mime_type: act.media_mime,
                              size: act.media_size,
                            }}
                            onChange={(v) =>
                              updateAction(idx, {
                                media_url: v.url,
                                media_filename: v.filename,
                                media_mime: v.mime_type,
                                media_size: v.size,
                              })
                            }
                          />
                          {(act.kind === "send_image" || act.kind === "send_video" || act.kind === "send_document") && (
                            <div className="grid gap-1">
                              <Label className="text-[10px] text-muted-foreground">Legenda (opcional)</Label>
                              <Input
                                value={act.caption || ""}
                                onChange={(e) => updateAction(idx, { caption: e.target.value })}
                                placeholder="Legenda da mídia..."
                                className="h-7 text-xs"
                              />
                            </div>
                          )}
                          {act.kind === "send_audio" && (
                            <div className="flex items-center justify-between rounded border border-border/50 bg-card/30 px-2.5 py-1.5">
                              <span className="text-[11px] text-foreground font-medium">Voz (PTT WhatsApp)</span>
                              <Switch
                                checked={!!act.is_voice}
                                onCheckedChange={(v) => updateAction(idx, { is_voice: v })}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {act.kind === "wait" && (
                        <div className="space-y-2">
                          <div className="grid gap-1.5">
                            <Label className="text-[10px] text-muted-foreground">Aguardar (segundos)</Label>
                            <Input
                              type="number"
                              min={1}
                              value={act.seconds || 5}
                              onChange={(e) => updateAction(idx, { seconds: Number(e.target.value) || 1 })}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="flex items-center justify-between rounded border border-border/50 bg-card/30 px-2.5 py-1.5">
                            <span className="text-[11px] text-foreground font-medium">Simular "digitando..."</span>
                            <Switch
                              checked={!!act.is_typing}
                              onCheckedChange={(v) => updateAction(idx, { is_typing: v })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Mensagem Principal</Label>
            <Textarea
              rows={4}
              value={typeof data.body === "string" ? data.body : ""}
              onChange={(e) => onChange({ body: e.target.value })}
              placeholder="Escreva a mensagem enviada ao contato…"
              className="resize-none text-xs"
            />
          </div>
        )}
      </div>

      {/* GERENCIADOR DE BOTÕES INTERATIVOS (PADRÃO BOTCONVERSA) */}
      <div className="space-y-2 border-t border-border/60 pt-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            🔘 Botões de Resposta ({buttons.length}/3)
          </span>
          {buttons.length < 3 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 text-[11px] px-2 gap-1"
              onClick={() => {
                const next = [...buttons, { id: String(buttons.length + 1), label: `Opção ${buttons.length + 1}` }];
                onChange({ buttons: next });
              }}
            >
              <Plus className="h-3 w-3" />
              <span>Botão</span>
            </Button>
          )}
        </div>
        {buttons.length > 0 ? (
          <div className="space-y-1.5 mt-2">
            {buttons.map((btn, bIdx) => (
              <div key={btn.id || bIdx} className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono text-muted-foreground w-4">{bIdx + 1}.</span>
                <Input
                  value={btn.label}
                  onChange={(e) => {
                    const next = [...buttons];
                    next[bIdx] = { ...next[bIdx], label: e.target.value };
                    onChange({ buttons: next });
                  }}
                  placeholder="Rótulo do botão..."
                  className="h-7 text-xs flex-1"
                  maxLength={20}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = buttons.filter((_, i) => i !== bIdx);
                    onChange({ buttons: next });
                  }}
                  className="p-1 text-destructive hover:bg-destructive/10 rounded"
                  title="Remover botão"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground italic">
              Cada botão cria uma porta de saída própria no canvas para ramificar a conversa.
            </p>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground italic px-1 py-1">
            Nenhum botão de resposta adicionado. Adicione até 3 botões por mensagem.
          </p>
        )}
      </div>
    </div>
  );
}
