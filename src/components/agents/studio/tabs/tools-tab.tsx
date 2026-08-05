import { Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { AGENT_TOOL_OPTIONS } from "@/lib/agents.constants";

const EXTRA_TOOLS = [
  { id: "database_query", label: "Consultar banco" },
  { id: "send_whatsapp", label: "Enviar WhatsApp" },
  { id: "send_email", label: "Enviar email" },
  { id: "api_call", label: "Chamar API" },
  { id: "webhook", label: "Webhook" },
  { id: "vector_store", label: "Banco vetorial" },
  { id: "web_search", label: "Pesquisa web" },
  { id: "file_upload", label: "Upload de arquivos" },
] as const;

export function ToolsTab({
  enabled,
  onChange,
}: {
  enabled: string[];
  onChange: (next: string[]) => void;
}) {
  const all = [
    ...AGENT_TOOL_OPTIONS.map((t) => ({ id: t.id as string, label: t.label })),
    ...EXTRA_TOOLS.map((t) => ({ id: t.id as string, label: t.label })),
  ];

  function toggle(id: string) {
    const set = new Set(enabled);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange(Array.from(set));
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {all.map((t) => {
        const active = enabled.includes(t.id);
        return (
          <div key={t.id} className="tool-card" data-active={active}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{t.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {active ? "Habilitada" : "Desabilitada"} · latência —
                </p>
              </div>
              <Switch checked={active} onCheckedChange={() => toggle(t.id)} />
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {active ? (
                <>
                  <Check className="h-3 w-3 text-success" /> pronta para uso
                </>
              ) : (
                <span>—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
