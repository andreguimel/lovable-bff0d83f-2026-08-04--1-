import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

/**
 * Global listener for new inbound messages across ALL company conversations.
 * Plays an alert sound and shows a toast that navigates to the conversation on click.
 * Reads preferences from window.localStorage (mirrored from profile.notification_prefs).
 */
export function useInboxNotifications(companyId: string | null | undefined) {
  const navigate = useNavigate();
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    return () => {
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const playBeep = () => {
    if (typeof window === "undefined") return;
    try {
      const Ctor: typeof AudioContext =
        (window as any).AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctor) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctor();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
    } catch {
      /* ignore */
    }
  };


  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`inbox-notify:${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            direction: string;
            conversation_id: string;
            body: string | null;
            type: string;
          };
          if (row.direction !== "inbound") return;

          // Read prefs from localStorage (soundEnabled default true)
          let soundEnabled = true;
          try {
            const raw = window.localStorage.getItem("zenda:notif-prefs");
            if (raw) soundEnabled = JSON.parse(raw).sound !== false;
          } catch {
            // ignore
          }

          if (soundEnabled) {
            playBeep();
          }


          const preview =
            row.body?.slice(0, 60) ??
            (row.type === "image"
              ? "📷 Imagem"
              : row.type === "audio"
                ? "🎤 Áudio"
                : row.type === "video"
                  ? "🎬 Vídeo"
                  : "📎 Arquivo");
          toast("Nova mensagem", {
            description: preview,
            action: {
              label: "Abrir",
              onClick: () => navigate({ to: "/inbox/$conversationId", params: { conversationId: row.conversation_id } }),
            },
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, navigate]);
}
