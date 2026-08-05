import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/ready")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY;
        const ok = !!(url && key);
        return new Response(JSON.stringify({ status: ok ? "ready" : "not_ready" }), {
          status: ok ? 200 : 503,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
