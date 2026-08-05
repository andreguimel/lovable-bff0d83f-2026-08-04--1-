import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, File as FileIcon, ImageIcon, Trash2, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ClientTime } from "@/components/client-time";
import { listContactFiles, deleteContactFile } from "@/lib/crm-hub.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  ATTACHMENT_BUCKETS,
  ATTACHMENT_LIMITS,
  friendlyStorageError,
  kindFromFile,
  validateAttachment,
} from "@/lib/attachments";

export function FilesTab({ contactId }: { contactId: string }) {
  const listFn = useServerFn(listContactFiles);
  const delFn = useServerFn(deleteContactFile);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const q = useQuery({
    queryKey: ["contact-files", contactId],
    queryFn: () => listFn({ data: { contactId } }),
  });

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      const invalid = validateAttachment(file, kindFromFile(file), ATTACHMENT_LIMITS.crm);
      if (invalid) {
        toast.error(`${file.name}: ${invalid}`);
        return;
      }
    }
    setUploading(true);
    try {
      for (const file of list) {
        const path = `${contactId}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage
          .from(ATTACHMENT_BUCKETS.contactFiles)
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
          });
        if (error) {
          throw new Error(friendlyStorageError(error.message, ATTACHMENT_BUCKETS.contactFiles));
        }
      }
      toast.success("Arquivo(s) enviado(s)");
      qc.invalidateQueries({ queryKey: ["contact-files", contactId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  };


  const remove = useMutation({
    mutationFn: (path: string) => delFn({ data: { path } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact-files", contactId] }),
  });

  const files = q.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 bg-muted/20 p-8 transition-colors",
          dragging && "border-primary bg-primary/5",
        )}
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : (
          <Upload className="h-6 w-6 text-muted-foreground" />
        )}
        <p className="text-sm font-medium">Arraste arquivos aqui</p>
        <p className="text-xs text-muted-foreground">Ou</p>
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          Selecionar arquivos
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </div>

      {files.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">Sem arquivos ainda.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {files.map((f) => {
            const isImage = f.mime.startsWith("image/");
            return (
              <div key={f.path} className="group relative overflow-hidden rounded-xl border border-border/40 bg-card">
                {isImage && f.url ? (
                  <img src={f.url} alt={f.name} className="aspect-square w-full object-cover" />
                ) : (
                  <div className="grid aspect-square w-full place-items-center bg-muted/30">
                    <FileIcon className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}
                <div className="p-2">
                  <p className="truncate text-xs font-medium">{f.name.replace(/^\d+-/, "")}</p>
                  <p className="text-[10px] text-muted-foreground">
                    <ClientTime iso={f.created_at ?? null} />
                  </p>
                </div>
                <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {f.url && (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid h-7 w-7 place-items-center rounded-md bg-card/90 shadow-sm backdrop-blur"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => remove.mutate(f.path)}
                    className="grid h-7 w-7 place-items-center rounded-md bg-card/90 shadow-sm backdrop-blur"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
