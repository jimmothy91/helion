import { createFileRoute } from "@tanstack/react-router";
import { REPORT_KEY, readReports } from "@/game/loss-store.server";

export const Route = createFileRoute("/api/loss-reports")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = new URL(request.url).searchParams.get("key");
        if (key !== REPORT_KEY) return new Response("Not found", { status: 404 });
        const reports = await readReports();
        return Response.json({ reports });
      },
    },
  },
});
