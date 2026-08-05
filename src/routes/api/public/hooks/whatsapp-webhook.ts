import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/hooks/whatsapp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("x-webhook-signature") ?? "";
        const rawBody = await request.text();
        const secret = process.env.WHATSAPP_WEBHOOK_SECRET;

        // Verify signature if secret configured (skip in dev if not set)
        if (secret) {
          try {
            const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
            const a = Buffer.from(signature);
            const b = Buffer.from(expected);
            if (a.length !== b.length || !timingSafeEqual(a, b)) {
              return new Response("Invalid signature", { status: 401 });
            }
          } catch {
            return new Response("Invalid signature", { status: 401 });
          }
        }

        let payload: {
          channel_id?: string;
          message_id?: string;
          from?: string;
          body?: string;
          event?: string;
        };
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        if (!payload.channel_id) return new Response("Missing channel_id", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: ch } = await supabaseAdmin
          .from("channels")
          .select("id, company_id")
          .eq("id", payload.channel_id)
          .maybeSingle();
        if (!ch) return new Response("Unknown channel", { status: 404 });

        // Dedupe by message_id in payload
        if (payload.message_id) {
          const { data: existing } = await supabaseAdmin
            .from("channel_events")
            .select("id")
            .eq("channel_id", ch.id)
            .contains("payload", { message_id: payload.message_id })
            .limit(1)
            .maybeSingle();
          if (existing) return Response.json({ ok: true, deduped: true });
        }

        await supabaseAdmin.from("channel_events").insert({
          company_id: ch.company_id,
          channel_id: ch.id,
          event_type: payload.event === "message" ? "message_received" : "message_received",
          payload: JSON.parse(JSON.stringify(payload)),
        });

        return Response.json({ ok: true });
      },
    },
  },
});
