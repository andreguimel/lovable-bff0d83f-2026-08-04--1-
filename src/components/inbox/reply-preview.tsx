import { Image as ImageIcon, Mic, Paperclip, Video, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReplyPreviewMessage = {
  id: string;
  direction: "inbound" | "outbound";
  type: "text" | "image" | "audio" | "video" | "file";
  body?: string | null;
  media_metadata?: unknown;
};

interface ReplyPreviewProps {
  message: ReplyPreviewMessage;
  contactName: string;
  onClear: () => void;
  className?: string;
}

/**
 * WhatsApp-Web-style quoted preview shown above the composer while the user
 * is composing a reply. Rendered inline; the composer sends the reply's
 * message id and the backend threads it into the outbound provider payload
 * (`context.message_id` on WhatsApp Cloud).
 */
export function ReplyPreview({ message, contactName, onClear, className }: ReplyPreviewProps) {
  const author = message.direction === "outbound" ? "Você" : contactName;
  const summary = summarize(message);
  return (
    <div
      className={cn(
        "mx-3 mt-2 flex items-start gap-2 rounded-lg border-l-4 border-primary bg-muted/60 px-3 py-2 text-[13px]",
        className,
      )}
      data-testid="reply-preview"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-primary">Respondendo a {author}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-muted-foreground">
          {summary.icon}
          <span className="truncate">{summary.text}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label="Cancelar resposta"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function summarize(message: ReplyPreviewMessage): { icon: React.ReactNode; text: string } {
  const meta = (message.media_metadata as { name?: string } | null) ?? null;
  if (message.type === "image") return { icon: <ImageIcon className="h-3.5 w-3.5" />, text: message.body?.trim() || "Imagem" };
  if (message.type === "video") return { icon: <Video className="h-3.5 w-3.5" />, text: message.body?.trim() || "Vídeo" };
  if (message.type === "audio") return { icon: <Mic className="h-3.5 w-3.5" />, text: "Áudio" };
  if (message.type === "file") return { icon: <Paperclip className="h-3.5 w-3.5" />, text: meta?.name || "Arquivo" };
  return { icon: null, text: message.body?.trim() || "Mensagem" };
}
