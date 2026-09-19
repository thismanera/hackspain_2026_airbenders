import { z } from "zod";
import { prisma } from "@/lib/core/db";
import { scoreResultSchema } from "@/lib/features/scoring/contracts";
import type { ScoreResultDTO } from "@/lib/features/scoring/contracts";

export const listQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  run: z.string().optional(),
  band: z.enum(["A", "B", "C", "D"]).optional(),
  action: z.enum(["abrir", "ampliar", "mantener", "reducir", "cerrar"]).optional(),
  direction: z.enum(["mejora", "estable", "deterioro"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export function queryObject(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}
export async function completedRun(run?: string) {
  return run
    ? prisma.scoreRun.findFirst({ where: { id: run, status: "complete" } })
    : prisma.scoreRun.findFirst({
        where: { status: "complete" },
        orderBy: { completedAt: "desc" },
      });
}
export function invalid(error: z.ZodError): Response {
  return Response.json({ error: z.treeifyError(error) }, { status: 400 });
}
export async function listCompanies(request: Request): Promise<Response> {
  const parsed = listQuery.safeParse(queryObject(request));
  if (!parsed.success) return invalid(parsed.error);
  const { run, month = "2026-08", band, action, direction, page, pageSize } = parsed.data;
  const selected = await completedRun(run);
  if (!selected) return Response.json({ error: "Run not found" }, { status: 404 });
  const where = { runId: selected.id, month, band, action, direction };
  const [total, rows] = await Promise.all([
    prisma.companyMonthScore.count({ where }),
    prisma.companyMonthScore.findMany({
      where,
      orderBy: [{ score: "desc" }, { companyId: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return Response.json({
    runId: selected.id,
    month,
    total,
    page,
    pageSize,
    rows: rows.map((r) => scoreResultSchema.parse(r.data)),
  });
}
export async function companyHistory(request: Request, companyId: string): Promise<Response> {
  const parsed = z.object({ run: z.string().optional() }).safeParse(queryObject(request));
  if (!parsed.success) return invalid(parsed.error);
  const run = await completedRun(parsed.data.run);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  const rows = await prisma.companyMonthScore.findMany({
    where: { runId: run.id, companyId },
    orderBy: { month: "asc" },
  });
  if (!rows.length) return Response.json({ error: "Company not found" }, { status: 404 });
  return Response.json({
    runId: run.id,
    latest: scoreResultSchema.parse(rows.at(-1)!.data),
    history: rows.map((r) => scoreResultSchema.parse(r.data)),
  });
}
export async function runDetail(runId: string): Promise<Response> {
  const run = await completedRun(runId);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  return Response.json({
    id: run.id,
    parameterVersion: run.parameterVersion,
    manifest: run.manifest,
    metrics: run.metrics,
    completedAt: run.completedAt,
  });
}
function cell(value: ScoreResultDTO[keyof ScoreResultDTO] | string): string {
  const s =
    typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
  return `"${s.replaceAll('"', '""')}"`;
}
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
  const run = await completedRun(parsed.data.run);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  const rows = await prisma.companyMonthScore.findMany({
    where: {
      runId: run.id,
      ...(parsed.data.mode === "month" ? { month: parsed.data.month ?? "2026-08" } : {}),
    },
    orderBy: [{ companyId: "asc" }, { month: "desc" }],
  });
  const seen = new Set<string>();
  const latest = rows
    .filter((r) => {
      if (parsed.data.mode !== "latest") return true;
      if (seen.has(r.companyId)) return false;
      seen.add(r.companyId);
      return true;
    })
    .map((r) => scoreResultSchema.parse(r.data));
  const keys: (keyof ScoreResultDTO)[] = [
    "company",
    "month",
    "score",
    "confidence",
    "trend3m",
    "direction",
    "nature",
    "contributions",
    "deltas",
    "baseCapacity",
    "adverseCapacity",
    "capacityLimit",
    "operatingLimit",
    "recommendedLimit",
    "appliedLimit",
    "band",
    "price",
    "action",
    "reason",
    "alerts",
    "coverage",
    "parameterVersion",
  ];
  const csv =
    [
      "runId," + keys.join(","),
      ...latest.map((row) => {
        return [run.id, ...keys.map((k) => row[k])].map(cell).join(",");
      }),
    ].join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="score-${run.id}.csv"`,
    },
  });
}
