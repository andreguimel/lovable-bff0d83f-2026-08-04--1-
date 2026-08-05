import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { locale: ptBR, addSuffix: true });
  } catch {
    return "";
  }
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return format(new Date(iso), "HH:mm", { locale: ptBR });
  } catch {
    return "";
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return "";
  }
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
