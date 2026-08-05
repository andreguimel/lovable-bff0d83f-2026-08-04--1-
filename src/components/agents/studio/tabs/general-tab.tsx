import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { AGENT_MODEL_OPTIONS, DEFAULT_AGENT_MODEL } from "@/lib/agents.constants";
import type { Agent } from "@/lib/agents.functions";

export function GeneralTab({
  form,
  set,
}: {
  form: Agent;
  set: <K extends keyof Agent>(k: K, v: Agent[K]) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identidade</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Nome">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Departamento">
              <Input
                value={form.department ?? ""}
                onChange={(e) => set("department", e.target.value)}
                placeholder="Ex.: Vendas"
              />
            </Field>
            <Field label="Especialidade">
              <Input
                value={form.specialty ?? ""}
                onChange={(e) => set("specialty", e.target.value)}
                placeholder="Ex.: SDR outbound"
              />
            </Field>
          </div>
          <Field label="Papel (role)">
            <Input
              value={form.role ?? ""}
              onChange={(e) => set("role", e.target.value)}
              placeholder="Ex.: Assistente de suporte"
            />
          </Field>
          <Field label="Saudação inicial">
            <Input
              value={form.greeting ?? ""}
              onChange={(e) => set("greeting", e.target.value)}
              placeholder="Olá! Como posso ajudar?"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modelo & parâmetros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Modelo">
              <Select
                value={form.model || DEFAULT_AGENT_MODEL}
                onValueChange={(v) => set("model", v)}
              >
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
            </Field>
            <Field label="Idioma">
              <Input value={form.language} onChange={(e) => set("language", e.target.value)} />
            </Field>
          </div>

          <SliderRow
            label="Temperatura"
            value={Number(form.temperature ?? 0.7)}
            max={2}
            step={0.05}
            onChange={(v) => set("temperature", v)}
          />
          <SliderRow
            label="Top P"
            value={Number(form.top_p ?? 1)}
            max={1}
            step={0.05}
            onChange={(v) => set("top_p", v)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max tokens">
              <Input
                type="number"
                value={form.max_tokens ?? ""}
                onChange={(e) => set("max_tokens", e.target.value ? Number(e.target.value) : null)}
                placeholder="1024"
              />
            </Field>
            <Field label="Max turnos">
              <Input
                type="number"
                value={form.max_turns ?? 6}
                onChange={(e) => set("max_turns", Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SliderRow
              label="Frequency penalty"
              value={Number(form.frequency_penalty ?? 0)}
              min={-2}
              max={2}
              step={0.1}
              onChange={(v) => set("frequency_penalty", v)}
            />
            <SliderRow
              label="Presence penalty"
              value={Number(form.presence_penalty ?? 0)}
              min={-2}
              max={2}
              step={0.1}
              onChange={(v) => set("presence_penalty", v)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min = 0,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span>{Number(value).toFixed(2)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}
