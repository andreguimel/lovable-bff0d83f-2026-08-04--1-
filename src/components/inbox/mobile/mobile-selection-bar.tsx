/**
 * Top selection bar shown on mobile when the user enters multi-select
 * mode (long-press → Selecionar). Mirrors WhatsApp Business.
 */
import { X, Trash2, Copy, Forward } from "lucide-react";
import { toast } from "sonner";
import type { DeleteCapabilities } from "@/lib/message-delete.functions";
import { cn } from "@/lib/utils";

interface Props {
  count: number;
  anyOutbound: boolean;
  allOutbound: boolean;
  bodies: string[];
  capabilities: DeleteCapabilities | null;
  canDelete: boolean;
  onCancel: () => void;
  onForward: () => void;
  onDelete: (scope: "inbox_only" | "for_me" | "for_everyone") => void;
}


export function MobileSelectionBar({
  count,
  anyOutbound,
  allOutbound,
  bodies,
  capabilities,
  canDelete,
  onCancel,
  onForward,
  onDelete,
}: Props) {

  const canForEveryone =
    canDelete && allOutbound && (capabilities?.supportsForEveryone ?? false);

  const handleCopy = async () => {
    const text = bodies.filter(Boolean).join("\n\n");
    if (!text) {
      toast.info("Nada para copiar");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(count === 1 ? "Mensagem copiada" : `${count} mensagens copiadas`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div
      className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-primary/5 px-3"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancelar seleção"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-accent active:bg-accent/70"
      >
        <X className="h-5 w-5" />
      </button>
      <span className="flex-1 truncate text-[15px] font-medium">
        {count} {count === 1 ? "selecionada" : "selecionadas"}
      </span>

      <button
        type="button"
        onClick={onForward}
        aria-label="Encaminhar"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-accent active:bg-accent/70"
      >
        <Forward className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copiar"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-accent active:bg-accent/70"
      >
        <Copy className="h-5 w-5" />
      </button>


      {canDelete && (
        <>
          <button
            type="button"
            onClick={() => onDelete("for_me")}
            aria-label="Excluir para mim"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-accent active:bg-accent/70"
          >
            <Trash2 className="h-5 w-5" />
          </button>
          <button
            type="button"
            disabled={!canForEveryone}
            onClick={() => canForEveryone && onDelete("for_everyone")}
            aria-label="Excluir para todos"
            title={
              !canForEveryone
                ? anyOutbound
                  ? capabilities?.reasonForEveryone ?? "Indisponível"
                  : "Somente enviadas por você."
                : undefined
            }
            className={cn(
              "grid h-11 shrink-0 place-items-center rounded-full px-3 text-[12px] font-semibold text-destructive",
              "hover:bg-destructive/10 active:bg-destructive/15",
              !canForEveryone && "opacity-40",
            )}
          >
            Todos
          </button>
        </>
      )}
    </div>
  );
}
