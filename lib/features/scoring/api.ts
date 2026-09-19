import { z } from "zod";
import { prisma } from "@/lib/core/db";
import { decisionRowSchema, type DecisionRowDTO } from "@/lib/features/decision/contracts";
import {
  parametersSchema,
  scoreRowSchema,
  type ScoreRowDTO,
} from "@/lib/features/scoring/contracts";

export const listQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  run: z.string().optional(),
  band: z.enum(["A", "B", "C", "D"]).optional(),
  action: z.enum(["abrir", "ampliar", "mantener", "reducir", "cerrar"]).optional(),
  direction: z.enum(["mejora", "estable", "deterioro"]).optional(),
  estadoGrupo: z.enum(["sana", "vigilar", "riesgo", "sin_datos"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export function queryObject(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}
class IncompatibleScoreRunError extends Error {}

export async function completedRun(run?: string) {
  const candidates = run
    ? await prisma.scoreRun.findMany({
        where: { id: run, status: "complete" },
        include: { scores: { take: 1 }, parameters: true },
      })
    : await prisma.scoreRun.findMany({
        where: { status: "complete" },
        orderBy: { completedAt: "desc" },
        include: { scores: { take: 1 }, parameters: true },
      });
  for (const candidate of candidates) {
    const parameters = parametersSchema.safeParse(candidate.parameters.data);
    if (!parameters.success || parameters.data.version !== candidate.parameterVersion) {
      if (run) throw new IncompatibleScoreRunError();
      continue;
    }
    const sample = candidate.scores[0];
    if (!sample) {
      if (run) throw new IncompatibleScoreRunError();
      continue;
    }
    const parsed = scoreRowSchema.safeParse(sample.data);
    if (parsed.success) return candidate;
    if (run) throw new IncompatibleScoreRunError();
  }
  return null;
}
export function invalid(error: z.ZodError): Response {
  return Response.json({ error: z.treeifyError(error) }, { status: 400 });
}
/** Una fila de la API es el scoreSolo del motor nuevo más la decisión v1, si se importó. */
function merged(row: { data: unknown; decision: { data: unknown } | null }) {
  try {
    return {
      scoreSolo: scoreRowSchema.parse(row.data),
      decision: row.decision ? decisionRowSchema.parse(row.decision.data) : null,
    };
  } catch (error) {
    if (error instanceof z.ZodError) throw new IncompatibleScoreRunError();
    throw error;
  }
}
export async function listCompanies(request: Request): Promise<Response> {
  const parsed = listQuery.safeParse(queryObject(request));
  if (!parsed.success) return invalid(parsed.error);
  const {
    run,
    month = "2026-08",
    band,
    action,
    direction,
    estadoGrupo,
    page,
    pageSize,
  } = parsed.data;
  let selected;
  try {
    selected = await completedRun(run);
  } catch (error) {
    if (error instanceof IncompatibleScoreRunError)
      return Response.json(
        { error: "Run uses an incompatible scoring contract", code: "SCORING_VERSION_MISMATCH" },
        { status: 409 },
      );
    throw error;
  }
  if (!selected) return Response.json({ error: "Run not found" }, { status: 404 });
  const where = {
    runId: selected.id,
    month,
    direction,
    estadoGrupo,
    // `banda`/`accion` viven en la decisión, no en el score.
    ...(band || action ? { decision: { is: { band, action } } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.companyMonthScore.count({ where }),
    prisma.companyMonthScore.findMany({
      where,
      include: { decision: true },
      orderBy: [{ scoreSolo: "desc" }, { companyId: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  try {
    return Response.json({
      runId: selected.id,
      month,
      total,
      page,
      pageSize,
      rows: rows.map(merged),
    });
  } catch (error) {
    if (error instanceof IncompatibleScoreRunError)
      return Response.json(
        { error: "Run uses an incompatible scoring contract", code: "SCORING_VERSION_MISMATCH" },
        { status: 409 },
      );
    throw error;
  }
}
export async function companyHistory(request: Request, companyId: string): Promise<Response> {
  const parsed = z.object({ run: z.string().optional() }).safeParse(queryObject(request));
  if (!parsed.success) return invalid(parsed.error);
  let run;
  try {
    run = await completedRun(parsed.data.run);
  } catch (error) {
    if (error instanceof IncompatibleScoreRunError)
      return Response.json(
        { error: "Run uses an incompatible scoring contract", code: "SCORING_VERSION_MISMATCH" },
        { status: 409 },
      );
    throw error;
  }
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  const rows = await prisma.companyMonthScore.findMany({
    where: { runId: run.id, companyId },
    include: { decision: true },
    orderBy: { month: "asc" },
  });
  if (!rows.length) return Response.json({ error: "Company not found" }, { status: 404 });
  try {
    return Response.json({
      runId: run.id,
      latest: merged(rows.at(-1)!),
      history: rows.map(merged),
    });
  } catch (error) {
    if (error instanceof IncompatibleScoreRunError)
      return Response.json(
        { error: "Run uses an incompatible scoring contract", code: "SCORING_VERSION_MISMATCH" },
        { status: 409 },
      );
    throw error;
  }
}
export async function runDetail(runId: string): Promise<Response> {
  let run;
  try {
    run = await completedRun(runId);
  } catch (error) {
    if (error instanceof IncompatibleScoreRunError)
      return Response.json(
        { error: "Run uses an incompatible scoring contract", code: "SCORING_VERSION_MISMATCH" },
        { status: 409 },
      );
    throw error;
  }
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  const sample = await prisma.companyMonthScore.findFirst({ where: { runId: run.id } });
  if (!sample || !scoreRowSchema.safeParse(sample.data).success)
    return Response.json(
      { error: "Run uses an incompatible scoring contract", code: "SCORING_VERSION_MISMATCH" },
      { status: 409 },
    );
  return Response.json({
    id: run.id,
    parameterVersion: run.parameterVersion,
    manifest: run.manifest,
    metrics: run.metrics,
    completedAt: run.completedAt,
  });
}
function cell(
  value: ScoreRowDTO[keyof ScoreRowDTO] | DecisionRowDTO[keyof DecisionRowDTO],
): string {
  const s =
    typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
  return `"${s.replaceAll('"', '""')}"`;
}
const SCORE_KEYS = [
  "company",
  "month",
  "scoreSolo",
  "scoreGrupo",
  "ajusteHolding",
  "aportacionGrupo",
  "deltaGrupo",
  "estadoSolo",
  "estadoGrupo",
  "perfilGrupo",
  "confianza",
  "subscores",
  "confs",
  "direccion",
  "naturaleza",
  "patronTrayectoria",
  "tendScore3m",
  "tendScore6m",
  "tendScore12m",
  "tend3m",
  "alertaTempranaDeterioro",
  "diagnosticoMejora",
  "factorDeterminante",
  "factorDeterminanteGrupo",
  "canarioEnMina",
  "inflexion",
  "inflexionGrupo",
  "rachaB2",
  "rachaDeficit",
  "C3dias",
  "C4",
  "cobrosOpMedia3m",
  "cobrosOpMedia6m",
  "pagosOpMedia6m",
  "servicioDeudaMedia6m",
  "amortCreditoMedia6m",
  "obligacionesRecMedia6m",
  "capacidadCuotaAdv",
  "D1",
  "D2",
  "D3",
  "D4",
  "D5",
  "confD",
  "tienePrestamoIntragrupo",
  "cobrosOpGrupoMedia6m",
  "pagosOpGrupoMedia6m",
  "servicioDeudaGrupoMedia6m",
  "deficitMes",
  "margenMes",
  "senales",
  "variables",
  "deltaContrib",
  "alertas",
  "cobertura",
  "versionParametros",
] as const satisfies readonly (keyof ScoreRowDTO)[];
const DECISION_KEYS = [
  "elegible",
  "motivo",
  "banda",
  "bandaEfectiva",
  "L",
  "LVigente",
  "TMax",
  "accion",
  "motivoAccion",
  "motivoGrupo",
  "bandaPred3mUsada",
] as const satisfies readonly (keyof DecisionRowDTO)[];
export async function exportScores(request: Request): Promise<Response> {
  const parsed = z
    .object({
      run: z.string().optional(),
      month: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
        .optional(),
      mode: z.enum(["month", "latest"]).default("month"),
    })
    .safeParse(queryObject(request));
  if (!parsed.success) return invalid(parsed.error);
  let run;
  try {
    run = await completedRun(parsed.data.run);
  } catch (error) {
    if (error instanceof IncompatibleScoreRunError)
      return Response.json(
        { error: "Run uses an incompatible scoring contract", code: "SCORING_VERSION_MISMATCH" },
        { status: 409 },
      );
    throw error;
  }
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  const rows = await prisma.companyMonthScore.findMany({
    where: {
      runId: run.id,
      ...(parsed.data.mode === "month" ? { month: parsed.data.month ?? "2026-08" } : {}),
    },
    include: { decision: true },
    orderBy: [{ companyId: "asc" }, { month: "desc" }],
  });
  const seen = new Set<string>();
  let latest: ReturnType<typeof merged>[];
  try {
    latest = rows
      .filter((r) => {
        if (parsed.data.mode !== "latest") return true;
        if (seen.has(r.companyId)) return false;
        seen.add(r.companyId);
        return true;
      })
      .map(merged);
  } catch (error) {
    if (error instanceof IncompatibleScoreRunError)
      return Response.json(
        { error: "Run uses an incompatible scoring contract", code: "SCORING_VERSION_MISMATCH" },
        { status: 409 },
      );
    throw error;
  }
  const csv =
    [
      ["runId", ...SCORE_KEYS, ...DECISION_KEYS].join(","),
      ...latest.map(({ scoreSolo, decision }) =>
        [
          run.id,
          ...SCORE_KEYS.map((k) => scoreSolo[k]),
          // Una fila sin decisión importada deja vacías las columnas de decisión.
          ...DECISION_KEYS.map((k) => (decision ? decision[k] : "")),
        ]
          .map(cell)
          .join(","),
      ),
    ].join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="score-${run.id}.csv"`,
    },
  });
}
