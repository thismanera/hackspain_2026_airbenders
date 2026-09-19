import { z } from "zod";

import { scoringResponse } from "@/lib/features/portfolio/http";
import { getPeerMap } from "@/lib/features/portfolio/source";

const querySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  scope: z.enum(["embat", "partner"]).default("partner"),
  empresa: z
    .string()
    .regex(/^COMP_\d{4}$/)
    .optional(),
});

export async function GET(request: Request): Promise<Response> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }
  const { month, scope, empresa } = parsed.data;
  if (scope === "embat" && !empresa) {
    return Response.json({ error: "La vista de empresa necesita `empresa`" }, { status: 400 });
  }

  return scoringResponse(async () => {
    const map = await getPeerMap({ month, scope, company: empresa });
    return empresa && map.focus === null ? null : map;
  }, "Empresa no encontrada");
}
