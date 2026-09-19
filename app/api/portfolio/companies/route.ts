import { z } from "zod";

import { scoringResponse } from "@/lib/features/portfolio/http";
import { getPortfolio } from "@/lib/features/portfolio/source";

const querySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  q: z.string().max(80).optional(),
  estado: z.enum(["todos", "sana", "vigilar", "riesgo", "sin_datos"]).optional(),
  accion: z.enum(["todas", "abrir", "ampliar", "mantener", "reducir", "cerrar"]).optional(),
  direccion: z.enum(["todas", "mejora", "estable", "deterioro"]).optional(),
  banda: z.enum(["todas", "A", "B", "C", "D"]).optional(),
  prevision: z.enum(["todas", "sube_banda", "baja_banda", "mantiene"]).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  return scoringResponse(() => getPortfolio(parsed.data), "Sin cartera", request);
}
