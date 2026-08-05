import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  ATTACHMENT_BUCKETS,
  ATTACHMENT_LIMITS,
  friendlyStorageError,
  validateAttachment,
} from "@/lib/attachments";
import {
  deleteKnowledgeDoc,
  listKnowledgeDocs,
  registerKnowledgeDoc,
} from "@/lib/agent-studio.functions";

export function KnowledgeTab({ agentId, companyId }: { agentId: string; companyId: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [urlTitle, setUrlTitle] = useState("");
  const [urlValue, setUrlValue] = useState("");

  const { data: docs = [] } = useQuery({
    queryKey: ["knowledge-docs", agentId],
    queryFn: () => listKnowledgeDocs({ data: { agentId } }),
  });

  const registerMut = useMutation({
    mutationFn: registerKnowledgeDoc,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knowledge-docs", agentId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteKnowledgeDoc({ data: { id } }),
    onSuccess: () => {
      toast.success("Documento removido");
      qc.invalidateQueries({ queryKey: ["knowledge-docs", agentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    let ok = 0;
    for (const file of Array.from(files)) {
      const invalid = validateAttachment(file, "file", ATTACHMENT_LIMITS.knowledge);
      if (invalid) {
        toast.error(`${file.name}: ${invalid}`);
        continue;
      }
      const path = `${companyId}/${agentId}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage
        .from(ATTACHMENT_BUCKETS.agentKnowledge)
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (error) {
        toast.error(friendlyStorageError(error.message, ATTACHMENT_BUCKETS.agentKnowledge));
        continue;
      }
      await registerMut.mutateAsync({
        data: {
          agentId,
          title: file.name,
          type: "file",
          storage_path: path,
          size_bytes: file.size,
        },
      });
      ok += 1;
    }
    if (ok > 0) toast.success("Upload concluído");
  }


  return (
    <div className="grid gap-4">
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFiles(e.dataTransfer.files);
        }}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">Arraste arquivos aqui</p>
        <p className="text-xs text-muted-foreground">
          PDF · DOCX · TXT · CSV · MD — armazenados de forma privada
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.csv,.md"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <Button size="sm" onClick={() => inputRef.current?.click()}>
          Escolher arquivos
        </Button>
      </div>

      <div className="grid gap-2 rounded-2xl border p-3 md:grid-cols-[1fr_1fr_auto]">
        <Input
          placeholder="Título (ex.: FAQ do produto)"
          value={urlTitle}
          onChange={(e) => setUrlTitle(e.target.value)}
        />
        <Input
          placeholder="URL (site, Notion, Docs…)"
          value={urlValue}
          onChange={(e) => setUrlValue(e.target.value)}
        />
        <Button
          size="sm"
          disabled={!urlTitle.trim() || !urlValue.trim() || registerMut.isPending}
          onClick={() =>
            registerMut.mutate(
              {
                data: {
                  agentId,
                  title: urlTitle.trim(),
                  type: "url",
                  source_url: urlValue.trim(),
                },
              },
              {
                onSuccess: () => {
                  setUrlTitle("");
                  setUrlValue("");
                  toast.success("Fonte adicionada");
                },
              },
            )
          }
        >
          {registerMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
        </Button>
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="border-b px-4 py-3 text-sm font-medium">Documentos ({docs.length})</div>
        {docs.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            Nenhum documento indexado.
          </p>
        ) : (
          docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-0">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {d.type} · {d.chunks} chunks · {d.status}
                  </p>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => deleteMut.mutate(d.id)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
