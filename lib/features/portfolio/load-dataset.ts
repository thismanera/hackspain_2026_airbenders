/**
 * Selección de la ejecución scoring+forecast+decisión compatible que hay en
 * Postgres y, para la importación, su traducción completa al contrato del panel.
 *
 * Todo lo que enseña la UI sale de aquí: no hay fixtures ni cálculos de score en
 * las pantallas (PRODUCT §invariantes). El panel no carga el run entero: lee las
 * filas materializadas por `snapshots.ts` (ver `source.ts`); `buildDataset` solo
 * lo ejecuta `scoring:import` para producirlas.
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/core/db";
import { decisionRowSchema } from "@/lib/features/decision/contracts";
import { forecastParametersSchema, forecastRowSchema } from "@/lib/features/forecast/contracts";
import { parametersSchema, scoreRowSchema } from "@/lib/features/scoring/contracts";

import { CALENDAR } from "./calendar";
import {
  engineMetrics,
  monthScore,
  ScoringUnavailableError,
  type CompanyDataset,
  type Dataset,
} from "./dataset";

export type RunHeader = {
  id: string;
  parameterVersion: string;
  completedAt: Date | null;
  metrics: Prisma.JsonValue | null;
};

const RUN_SELECT = {
  id: true,
  parameterVersion: true,
  completedAt: true,
  metrics: true,
  parameters: { select: { data: true } },
  forecasts: { take: 1, select: { parameterVersion: true, parameters: true } },
} satisfies Prisma.ScoreRunSelect;

type RunCandidate = Prisma.ScoreRunGetPayload<{ select: typeof RUN_SELECT }>;

function isCompatible(run: RunCandidate): boolean {
  const scoring = parametersSchema.safeParse(run.parameters.data);
  const forecast = run.forecasts[0];
  if (!forecast || !scoring.success || scoring.data.version !== run.parameterVersion) return false;
  const forecastParams = forecastParametersSchema.safeParse(forecast.parameters.data);
  return (
    forecastParams.success &&
    forecastParams.data.version === forecast.parameterVersion &&
    forecastParams.data.versionScoring === run.parameterVersion
  );
}

/**
 * Última ejecución completa cuyo contrato (scoring y forecast) coincide con el
 * código desplegado y que ya tiene el panel materializado. Las incompatibles se
 * saltan, igual que hace la API de scoring: una fila con otro contrato no se
 * puede pintar.
 */
export async function compatibleRun(): Promise<RunHeader | null> {
  const runs = await prisma.scoreRun.findMany({
    where: { status: "complete", snapshots: { some: { kind: "meta" } } },
    orderBy: { completedAt: "desc" },
    select: RUN_SELECT,
  });
  return runs.find(isCompatible) ?? null;
}

/** Una ejecución concreta (la que acaba de importarse), compatible o nada. */
export async function runHeader(runId: string): Promise<RunHeader> {
  const run = await prisma.scoreRun.findUnique({ where: { id: runId }, select: RUN_SELECT });
  if (!run || !isCompatible(run)) throw new Error(`run ${runId} is not compatible with this build`);
  return run;
}

const monthOrder = new Map(CALENDAR.map((month, index) => [month, index]));

export async function buildDataset(run: RunHeader): Promise<Dataset> {
  // Tres lecturas planas y unión en memoria: un `include` sobre la clave compuesta
  // de 30k filas supera el límite de parámetros de Postgres (P2029).
  const [companies, records, decisions, forecasts] = await Promise.all([
    prisma.scoreCompany.findMany({ select: { id: true, groupId: true, currency: true } }),
    prisma.companyMonthScore.findMany({
      where: { runId: run.id },
      select: { companyId: true, month: true, data: true },
      orderBy: [{ companyId: "asc" }, { month: "asc" }],
    }),
    prisma.companyMonthDecision.findMany({
      where: { runId: run.id },
      select: { companyId: true, month: true, data: true },
    }),
    prisma.companyMonthForecast.findMany({
      where: { runId: run.id },
      select: { companyId: true, month: true, data: true },
    }),
  ]);
  if (records.length === 0) throw new ScoringUnavailableError();

  const key = (row: { companyId: string; month: string }) => `${row.companyId}|${row.month}`;
  const decisionByKey = new Map(decisions.map((row) => [key(row), row.data]));
  const forecastByKey = new Map(forecasts.map((row) => [key(row), row.data]));

  const groupSizes = new Map<string, number>();
  const scored = new Set(records.map((record) => record.companyId));
  const byId = new Map(companies.map((company) => [company.id, company]));
  for (const id of scored) {
    const groupId = byId.get(id)?.groupId;
    if (groupId) groupSizes.set(groupId, (groupSizes.get(groupId) ?? 0) + 1);
  }

  const result = new Map<string, CompanyDataset>();
  for (const record of records) {
    const score = scoreRowSchema.parse(record.data);
    if (!monthOrder.has(score.month)) continue;
    const decision = decisionByKey.get(key(record));
    const forecast = forecastByKey.get(key(record));
    const previousMonth = CALENDAR[monthOrder.get(score.month)! - 1];
    const previousDecision =
      previousMonth === undefined
        ? undefined
        : decisionByKey.get(key({ companyId: record.companyId, month: previousMonth }));
    const point = monthScore(
      score,
      decision === undefined ? null : decisionRowSchema.parse(decision),
      forecast === undefined ? null : forecastRowSchema.parse(forecast),
      previousDecision === undefined ? null : decisionRowSchema.parse(previousDecision),
    );
    const company = byId.get(record.companyId);
    const entry =
      result.get(record.companyId) ??
      (() => {
        const created: CompanyDataset = {
          meta: {
            id: record.companyId,
            groupId: company?.groupId ?? score.groupId,
            country: "",
            currency: company?.currency ?? "EUR",
            erp: "",
            groupSize: groupSizes.get(company?.groupId ?? score.groupId) ?? 1,
          },
          months: [],
        };
        result.set(record.companyId, created);
        return created;
      })();
    entry.months.push(point);
  }
  for (const entry of result.values())
    entry.months.sort((a, b) => monthOrder.get(a.month)! - monthOrder.get(b.month)!);

  return {
    runId: run.id,
    parameterVersion: run.parameterVersion,
    completedAt: run.completedAt,
    engine: engineMetrics(run.metrics),
    companies: result,
  };
}

/** Sin Postgres o sin tablas (P2021) el motor no existe para el panel; otros fallos son bugs. */
function isDatabaseUnreachable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code.startsWith("P10")))
  );
}

/** Traduce los fallos de infraestructura al error que el panel sabe pintar. */
export function unavailableIfUnreachable(error: unknown): never {
  if (isDatabaseUnreachable(error)) {
    throw new ScoringUnavailableError(
      "No se puede leer la base de datos del motor de scoring (sin conexión o sin esquema)",
    );
  }
  throw error;
}
