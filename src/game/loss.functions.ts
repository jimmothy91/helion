import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Report = z.object({
  id: z.string().regex(/^[a-f0-9]{8}$/),
  build: z.string().min(1).max(40),
  bot: z.string().min(1).max(40),
  map: z.string().min(1).max(80),
  card: z.string().min(2).max(4000),
});

export const putLossReports = createServerFn({ method: "POST" })
  .validator(z.object({ reports: z.array(Report).min(1).max(16) }))
  .handler(async ({ data }): Promise<{ ok: true; kept: number }> => {
    const { saveReports } = await import("./loss-store.server");
    return saveReports(data.reports);
  });

export const listLossReports = createServerFn({ method: "POST" })
  .validator(z.object({ build: z.string().min(1).max(40) }))
  .handler(async ({ data }) => {
    const { readReports } = await import("./loss-store.server");
    return (await readReports()).filter((row) => row.build === data.build);
  });
