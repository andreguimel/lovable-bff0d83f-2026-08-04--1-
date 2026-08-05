import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  Pencil,
  Pause,
  Play,
  PlugZap,
  QrCode,
  Settings,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  archiveChannel,
  disconnectChannel,
  setChannelPaused,
} from "@/lib/channels.functions";

type ChannelLite = {
  id: string;
  name: string;
  status: string;
  paused_at: string | null;
  archived_at: string | null;
};

interface Props {
  channel: ChannelLite | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit: () => void;
  onConnect: () => void;
  onOpenDetail: () => void;
  onDelete: () => void;
}

/**
 * Mobile-native actions sheet — replaces the desktop DropdownMenu with
 * a bottom sheet exposing large, thumb-friendly targets (>= 48px).
 * Reuses existing server functions; no business-logic changes.
 */
export function MobileChannelActionsSheet({
  channel,
  open,
  onOpenChange,
  onEdit,
  onConnect,
  onOpenDetail,
  onDelete,
}: Props) {
  const qc = useQueryClient();
  const archive = useServerFn(archiveChannel);
  const disconnect = useServerFn(disconnectChannel);
  const pause = useServerFn(setChannelPaused);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["channels"] });

  const pauseMut = useMutation({
    mutationFn: () =>
      pause({ data: { id: channel!.id, paused: !channel!.paused_at } }),
    onSuccess: () => {
      invalidate();
      toast.success(channel?.paused_at ? "Canal retomado" : "Canal pausado");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectMut = useMutation({
    mutationFn: () => disconnect({ data: { id: channel!.id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Canal desconectado");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: () =>
      archive({ data: { id: channel!.id, archived: !channel!.archived_at } }),
    onSuccess: () => {
      invalidate();
      toast.success(channel?.archived_at ? "Canal restaurado" : "Canal arquivado");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!channel) return null;

  const isPaused = !!channel.paused_at;
  const isConnected = channel.status === "connected";
  const isArchived = !!channel.archived_at;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl p-0 pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="px-5 pt-4 text-left">
          <SheetTitle className="truncate">{channel.name}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col p-2">
          <ActionRow
            icon={<Settings className="h-5 w-5" />}
            label="Ver detalhes"
            onClick={() => {
              onOpenChange(false);
              onOpenDetail();
            }}
          />
          <ActionRow
            icon={<Pencil className="h-5 w-5" />}
            label="Editar canal"
            onClick={() => {
              onOpenChange(false);
              onEdit();
            }}
          />
          {isConnected ? (
            <ActionRow
              icon={<PlugZap className="h-5 w-5" />}
              label="Desconectar"
              onClick={() => disconnectMut.mutate()}
              disabled={disconnectMut.isPending}
            />
          ) : (
            <ActionRow
              icon={<QrCode className="h-5 w-5" />}
              label="Conectar (QR)"
              onClick={() => {
                onOpenChange(false);
                onConnect();
              }}
            />
          )}
          <ActionRow
            icon={isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            label={isPaused ? "Retomar canal" : "Pausar canal"}
            onClick={() => pauseMut.mutate()}
            disabled={pauseMut.isPending}
          />
          <div className="my-1 h-px bg-border/60" />
          <ActionRow
            icon={<Archive className="h-5 w-5" />}
            label={isArchived ? "Restaurar" : "Arquivar"}
            onClick={() => archiveMut.mutate()}
            disabled={archiveMut.isPending}
          />
          <ActionRow
            icon={<Trash2 className="h-5 w-5" />}
            label="Excluir canal"
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onDelete();
            }}
          />
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
    variant === "destructive"
      ? "text-destructive"
      : "text-foreground";
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
