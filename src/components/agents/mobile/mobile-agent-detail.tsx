import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Copy,
  Loader2,
  MoreVertical,
  Play,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMobileFab } from "@/components/mobile/mobile-fab";
import { deleteAgent, upsertAgent, type Agent } from "@/lib/agents.functions";
import { duplicateAgent } from "@/lib/agent-studio.functions";
import { DEFAULT_AGENT_MODEL } from "@/lib/agents.constants";
import { GeneralTab } from "@/components/agents/studio/tabs/general-tab";
import { ToolsTab } from "@/components/agents/studio/tabs/tools-tab";
import { MobilePlayground } from "./mobile-playground";

const PromptTab = lazy(() =>
  import("@/components/agents/studio/tabs/prompt-tab").then((m) => ({ default: m.PromptTab })),
);
const KnowledgeTab = lazy(() =>
  import("@/components/agents/studio/tabs/knowledge-tab").then((m) => ({ default: m.KnowledgeTab })),
);
const LogsTab = lazy(() =>
  import("@/components/agents/studio/tabs/logs-tab").then((m) => ({ default: m.LogsTab })),
);

type Tab = "resumo" | "prompt" | "ferramentas" | "conhecimento" | "logs";

const TABS: { id: Tab; label: string }[] = [
  { id: "resumo", label: "Resumo" },
  { id: "prompt", label: "Prompt" },
  { id: "ferramentas", label: "Ferramentas" },
  { id: "conhecimento", label: "Conhecimento" },
  { id: "logs", label: "Logs" },
];

export function MobileAgentDetail({ initial }: { initial: Agent }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { setAction } = useMobileFab();

  const [form, setForm] = useState<Agent>(initial);
  const set = <K extends keyof Agent>(k: K, v: Agent[K]) => setForm((f) => ({ ...f, [k]: v }));
  const [tab, setTab] = useState<Tab>("resumo");
  const [menuOpen, setMenuOpen] = useState(false);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);

  const saveMut = useMutation({
    mutationFn: () =>
      upsertAgent({
        data: {
          id: form.id,
          name: form.name,
          role: form.role,
          prompt: form.prompt,
          personality: form.personality,
          greeting: form.greeting,
          model: form.model || DEFAULT_AGENT_MODEL,
          temperature: Number(form.temperature),
          language: form.language || "pt-BR",
          channel_ids: form.channel_ids ?? [],
          enabled_tools: form.enabled_tools ?? [],
          max_turns: form.max_turns ?? 6,
          is_active: form.is_active,
        },
      }),
    onSuccess: (row) => {
      toast.success("Agente salvo");
      if (row) setForm(row as Agent);
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateMut = useMutation({
    mutationFn: () => duplicateAgent({ data: { id: form.id } }),
    onSuccess: (row) => {
      toast.success("Cópia criada");
      qc.invalidateQueries({ queryKey: ["agents"] });
      const id = (row as { id?: string } | null)?.id;
      if (id) navigate({ to: "/agents/$agentId", params: { agentId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteAgent({ data: { id: form.id } }),
    onSuccess: () => {
      toast.success("Agente excluído");
      qc.invalidateQueries({ queryKey: ["agents"] });
      navigate({ to: "/agents" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    setAction({
      label: "Playground",
      icon: Play,
      onClick: () => setPlaygroundOpen(true),
    });
    return () => setAction(null);
  }, [setAction]);

  const initials = form.name.slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur">
        <Button asChild size="icon" variant="ghost" className="h-9 w-9">
          <Link to="/agents">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{form.name}</p>
          <p className="truncate text-[10px] text-muted-foreground">{form.model}</p>
        </div>
        <Badge
          variant="secondary"
          className={
            form.is_active
              ? "bg-success/15 text-success"
              : "bg-muted text-muted-foreground"
          }
        >
          {form.is_active ? "Ativo" : "Pausado"}
        </Badge>
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9"
          onClick={() => setMenuOpen(true)}
        >
          <MoreVertical className="h-5 w-5" />
        </Button>
      </div>

      {/* Hero */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 text-lg font-semibold text-primary">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-semibold">{form.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {form.role ?? "Sem papel"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            temp {Number(form.temperature).toFixed(1)} · até {form.max_turns ?? 6} turnos
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 px-4 pt-3">
        <Button
          variant="outline"
          className="h-11"
          onClick={() => setPlaygroundOpen(true)}
        >
          <Play className="mr-1 h-4 w-4" /> Testar
        </Button>
        <Button
          className="h-11"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
        >
          {saveMut.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          Salvar
        </Button>
      </div>

      {/* Tabs */}
      <div className="mt-3 flex gap-1 overflow-x-auto border-b bg-background px-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors " +
              (tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          }
        >
          {tab === "resumo" && <GeneralTab form={form} set={set} />}
          {tab === "prompt" && (
            <PromptTab
              agentId={form.id}
              agentName={form.name}
              value={form.prompt ?? ""}
              onChange={(v) => set("prompt", v)}
            />
          )}
          {tab === "ferramentas" && (
            <ToolsTab
              enabled={form.enabled_tools ?? []}
              onChange={(v) => set("enabled_tools", v)}
            />
          )}
          {tab === "conhecimento" && (
            <KnowledgeTab agentId={form.id} companyId={form.company_id} />
          )}
          {tab === "logs" && <LogsTab agentId={form.id} />}
        </Suspense>
      </div>

      {/* Menu sheet */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Ações do agente</SheetTitle>
          </SheetHeader>
          <div className="mt-3 flex flex-col gap-1">
            <button
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-accent"
              onClick={() => {
                setMenuOpen(false);
                setPlaygroundOpen(true);
              }}
            >
              <Sparkles className="h-4 w-4" /> Abrir Playground
            </button>
            <button
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-accent"
              onClick={() => {
                set("is_active", !form.is_active);
                setMenuOpen(false);
              }}
            >
              <Play className="h-4 w-4" />{" "}
              {form.is_active ? "Pausar agente" : "Ativar agente"}
            </button>
            <button
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-accent"
              onClick={() => {
                setMenuOpen(false);
                duplicateMut.mutate();
              }}
            >
              <Copy className="h-4 w-4" /> Duplicar agente
            </button>
            <button
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-destructive hover:bg-destructive/10"
              onClick={() => {
                if (confirm(`Excluir "${form.name}"?`)) {
                  setMenuOpen(false);
                  deleteMut.mutate();
                }
              }}
            >
              <Trash2 className="h-4 w-4" /> Excluir agente
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {playgroundOpen && (
        <MobilePlayground agent={form} onClose={() => setPlaygroundOpen(false)} />
      )}
    </div>
  );
}
