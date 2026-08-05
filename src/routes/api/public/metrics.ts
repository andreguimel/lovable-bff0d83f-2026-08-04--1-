import { createFileRoute } from "@tanstack/react-router";
import { renderPrometheus } from "@/lib/observability/metrics";

export const Route = createFileRoute("/api/public/metrics")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(renderPrometheus(), {
          headers: { "Content-Type": "text/plain; version=0.0.4" },
        });
      },
    },
  },
});
