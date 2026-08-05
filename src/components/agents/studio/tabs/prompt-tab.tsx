import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  listPromptVersions,
  rollbackPromptVersion,
  savePromptVersion,
} from "@/lib/agent-studio.functions";

export function PromptTab({
  agentId,
  agentName,
  value,
  onChange,
}: {
  agentId: string;
  agentName: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const qc = useQueryClient();

  const { data: versions = [] } = useQuery({
    queryKey: ["prompt-versions", agentId],
    queryFn: () => listPromptVersions({ data: { agentId } }),
  });

  const saveMut = useMutation({
    mutationFn: () => savePromptVersion({ data: { agentId, prompt: value } }),
    onSuccess: () => {
      toast.success("Nova versão salva");
      qc.invalidateQueries({ queryKey: ["prompt-versions", agentId] });
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rollbackMut = useMutation({
    mutationFn: (versionId: string) =>
      rollbackPromptVersion({ data: { agentId, versionId } }),
    onSuccess: () => {
      toast.success("Prompt restaurado");
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const chars = value.length;
  const approxTokens = Math.ceil(chars / 4);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
      <div className="prompt-editor-shell">
        <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="font-mono">{agentName}.prompt</span>
            <span>·</span>
            <span>{chars} chars</span>
            <span>·</span>
            <span>~{approxTokens} tokens</span>
          </div>
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            Nova versão
          </Button>
        </div>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={20}
          spellCheck={false}
          className="min-h-[420px] resize-y border-0 bg-transparent font-mono text-[13px] leading-6 focus-visible:ring-0"
          placeholder="Descreva o objetivo, o tom, as instruções e as regras do agente…"
        />
      </div>

      <aside className="rounded-2xl border bg-card">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Versões</p>
          <p className="text-xs text-muted-foreground">Histórico, comparar e reverter</p>
        </div>
        <div className="max-h-[520px] overflow-y-auto">
          {versions.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              Sem versões salvas ainda.
            </p>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                className="flex items-start justify-between gap-2 border-b px-4 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">v{v.version}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(v.created_at), { locale: ptBR, addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => onChange(v.prompt)}
                  >
                    Ver
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => rollbackMut.mutate(v.id)}
                    disabled={rollbackMut.isPending}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" /> Restaurar
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
