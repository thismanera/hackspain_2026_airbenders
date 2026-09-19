import { z } from "zod";

import { getPortfolio } from "@/lib/features/portfolio/source";
import { ACCION, DIRECCION, ESTADO, NATURALEZA } from "@/lib/features/portfolio/vocabulary";

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
});

const COLUMNS = [
  "empresa",
  "grupo",
  "mes",
  "score",
  "confianza",
  "estado",
  "tendencia_3m",
  "direccion",
  "naturaleza",
  "banda",
  "limite_eur",
  "limite_anterior_eur",
  "tae",
  "accion",
  "alertas",
  "motivo",
] as const;

/** Comillas dobles siempre: los motivos llevan comas y el CSV acaba en Excel. */
function cell(value: string | number | null): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: Request): Promise<Response> {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { month, rows } = getPortfolio(parsed.data);

  const body = rows.map((row) =>
    [
      row.company.id,
      row.company.groupId,
      row.month,
      Math.round(row.score),
      row.confidence,
      ESTADO[row.estado].label,
      row.trend3m ?? "",
      DIRECCION[row.direction].label,
      NATURALEZA[row.nature].label,
      row.band,
      row.limit,
      row.previousLimit,
      row.apr ?? "",
      ACCION[row.action].label,
      row.alertCount,
      row.reason,
    ]
      .map(cell)
      .join(","),
  );

  // BOM para que Excel en español abra el fichero en UTF-8 sin destrozar tildes.
  const csv = `\uFEFF${[COLUMNS.join(","), ...body].join("\r\n")}\r\n`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cartera-${month}.csv"`,
    },
  });
}
