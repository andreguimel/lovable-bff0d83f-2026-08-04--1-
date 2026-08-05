import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Copy,
  Eye,
  Pause,
  Play,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  cancelBroadcast,
  deleteBroadcast,
  duplicateBroadcast,
  pauseBroadcast,
  resumeBroadcast,
  sendBroadcastBatch,
} from "@/lib/broadcasts.functions";

type BroadcastLite = {
  id: string;
  name: string;
  status: string;
};

interface Props {
  broadcast: BroadcastLite | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenDetail: () => void;
  onConfirmDelete: () => void;
}

/**
 * Mobile-native actions sheet — replaces desktop dropdowns and inline
 * buttons scattered across the card. Reuses existing server functions
 * (pause/resume/duplicate/cancel/tick), no business-logic changes.
 */
export function MobileCampaignActionsSheet({
  broadcast,
  open,
  onOpenChange,
  onOpenDetail,
  onConfirmDelete,
}: Props) {
  const qc = useQueryClient();
  const pauseFn = useServerFn(pauseBroadcast);
  const resumeFn = useServerFn(resumeBroadcast);
  const cancelFn = useServerFn(cancelBroadcast);
  const dupFn = useServerFn(duplicateBroadcast);
  const batchFn = useServerFn(sendBroadcastBatch);
  const delFn = useServerFn(deleteBroadcast);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["broadcasts"] });

  const runMut = useMutation({
    mutationFn: async (
      action: "pause" | "resume" | "cancel" | "duplicate" | "tick" | "delete",
    ) => {
      if (!broadcast) return;
      const id = broadcast.id;
      if (action === "pause") return pauseFn({ data: { id } });
      if (action === "resume") return resumeFn({ data: { id } });
      if (action === "cancel") return cancelFn({ data: { id } });
      if (action === "duplicate") return dupFn({ data: { id } });
      if (action === "tick") return batchFn({ data: { id, max: 50 } });
      if (action === "delete") return delFn({ data: { id } });
    },
    onSuccess: (_r, action) => {
      invalidate();
      const label =
        action === "pause"
          ? "Campanha pausada"
          : action === "resume"
            ? "Campanha retomada"
            : action === "cancel"
              ? "Campanha cancelada"
              : action === "duplicate"
                ? "Campanha duplicada"
                : action === "tick"
                  ? "Lote processado"
                  : "Campanha excluída";
      toast.success(label);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!broadcast) return null;
  const s = broadcast.status;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl p-0 pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="px-5 pt-4 text-left">
          <SheetTitle className="truncate">{broadcast.name}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col p-2">
          <ActionRow
            icon={<Eye className="h-5 w-5" />}
            label="Ver detalhes"
            onClick={() => {
              onOpenChange(false);
              onOpenDetail();
            }}
          />
          {s === "sending" && (
            <>
              <ActionRow
                icon={<Send className="h-5 w-5" />}
                label="Processar lote agora"
                onClick={() => runMut.mutate("tick")}
                disabled={runMut.isPending}
              />
              <ActionRow
                icon={<Pause className="h-5 w-5" />}
                label="Pausar envio"
                onClick={() => runMut.mutate("pause")}
                disabled={runMut.isPending}
              />
            </>
          )}
          {s === "paused" && (
            <ActionRow
              icon={<Play className="h-5 w-5" />}
              label="Retomar envio"
              onClick={() => runMut.mutate("resume")}
              disabled={runMut.isPending}
            />
          )}
          {["sending", "paused", "scheduled"].includes(s) && (
            <ActionRow
              icon={<X className="h-5 w-5" />}
              label="Cancelar campanha"
              onClick={() => runMut.mutate("cancel")}
              disabled={runMut.isPending}
            />
          )}
          <ActionRow
            icon={<Copy className="h-5 w-5" />}
            label="Duplicar campanha"
            onClick={() => runMut.mutate("duplicate")}
            disabled={runMut.isPending}
          />
          {["draft", "completed", "cancelled", "failed"].includes(s) && (
            <>
              <div className="my-1 h-px bg-border/60" />
              <ActionRow
                icon={<Trash2 className="h-5 w-5" />}
                label="Excluir campanha"
                variant="destructive"
                onClick={() => {
                  onOpenChange(false);
                  onConfirmDelete();
                }}
              />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
  disabled,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "destructive";
}) {
  const tone =
    variant === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-4 text-left text-[15px] font-medium transition active:bg-muted disabled:opacity-50 ${tone}`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted/60">
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}
