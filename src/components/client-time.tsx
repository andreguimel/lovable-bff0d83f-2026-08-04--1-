import { useEffect, useState } from "react";

import { formatRelative, formatTime, formatDateTime } from "@/lib/format";

type Mode = "relative" | "time" | "datetime";

export function ClientTime({ iso, mode = "relative", fallback = "—" }: {
  iso: string | null | undefined;
  mode?: Mode;
  fallback?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !iso) return <span suppressHydrationWarning>{fallback}</span>;
  const text = mode === "time" ? formatTime(iso) : mode === "datetime" ? formatDateTime(iso) : formatRelative(iso);
  return <span>{text}</span>;
}
