/**
 * Selection toolbar — appears at the top of the conversation when
 * `selectionCount > 0`, WhatsApp-Web style.
 */
import { X, Trash2, Forward } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DeleteCapabilities } from "@/lib/message-delete.functions";

interface Props {
  count: number;
  anyOutbound: boolean;
  allOutbound: boolean;
  capabilities: DeleteCapabilities | null;
  canDelete: boolean;
  onCancel: () => void;
  onForward: () => void;
  onDelete: (scope: "inbox_only" | "for_me" | "for_everyone") => void;
}


export function SelectionToolbar({
  count,
  anyOutbound,
  allOutbound,
  capabilities,
  canDelete,
  onCancel,
  onForward,
  onDelete,
}: Props) {

  const canForEveryone =
    canDelete && allOutbound && (capabilities?.supportsForEveryone ?? false);
  const forEveryoneReason = !allOutbound
    ? "Todas as mensagens selecionadas precisam ter sido enviadas por você."
    : capabilities?.reasonForEveryone;

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-primary/5 px-6">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onCancel}
        aria-label="Cancelar seleção"
      >
        <X className="h-4 w-4" />
      </Button>
      <span className="text-sm font-medium">
        {count} {count === 1 ? "mensagem selecionada" : "mensagens selecionadas"}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          onClick={onForward}
        >
          <Forward className="h-3.5 w-3.5" />
          Encaminhar
        </Button>
        {canDelete && (
          <>

            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={() => onDelete("for_me")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir para mim
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              disabled={!canForEveryone}
              title={!canForEveryone ? forEveryoneReason : undefined}
              onClick={() => canForEveryone && onDelete("for_everyone")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir para todos
              {anyOutbound && !canForEveryone && (
                <span className="ml-1 text-[10px] text-muted-foreground">(indisponível)</span>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-muted-foreground"
              onClick={() => onDelete("inbox_only")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Só do inbox
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
