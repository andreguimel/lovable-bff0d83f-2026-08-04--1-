import { FileText, FileSpreadsheet, FileImage, File as FileIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Attachment = {
  id: string;
  file: File;
  base64: string;
};

function iconFor(type: string) {
  if (type.startsWith("image/")) return FileImage;
  if (type === "application/pdf") return FileText;
  if (type.includes("sheet") || type === "text/csv" || type.includes("excel")) return FileSpreadsheet;
  if (type.includes("word") || type === "text/plain") return FileText;
  return FileIcon;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface Props {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

export function EmailAttachmentList({ attachments, onRemove }: Props) {
  if (attachments.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {attachments.map((a) => {
        const Icon = iconFor(a.file.type);
        return (
          <li
            key={a.id}
            className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5"
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{a.file.name}</p>
              <p className="text-[10px] text-muted-foreground">{formatSize(a.file.size)}</p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => onRemove(a.id)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
