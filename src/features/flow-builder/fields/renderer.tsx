/**
 * FB-04 — Renderer universal de campos.
 *
 * Nenhum bloco importa Input/Select/Textarea/Switch/MediaPicker diretamente
 * no seu Inspector. Tudo passa por este renderer, garantindo consistência
 * visual, foco no autofill e um único ponto para futuras evoluções
 * (busca de propriedades, comandos, IA sugerindo valores etc.).
 */
import { AlertTriangle, Info, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MediaPicker } from "@/components/flows/media-picker";
import { isEmpty, type FieldSpec, type SidebarCtx } from "./types";
export { makeErrorLookup } from "./validation";


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
  }
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
