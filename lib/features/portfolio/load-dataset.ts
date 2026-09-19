/**
 * Carga en memoria la última ejecución scoring+forecast+decisión compatible que
 * hay en Postgres y la traduce al contrato del panel.
 *
 * Todo lo que enseña la UI sale de aquí: no hay fixtures ni cálculos de score en
 * las pantallas (PRODUCT §invariantes). La ejecución se memoriza por proceso y
 * se invalida sola cuando cambia la última `score_runs` completa, así que una
 * petición normal cuesta una consulta ligera y nada de parseo.
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

type RunHeader = {
  id: string;
  parameterVersion: string;
  completedAt: Date | null;
  metrics: Prisma.JsonValue | null;
};

/**
 * Última ejecución completa cuyo contrato (scoring y forecast) coincide con el
 * código desplegado. Las incompatibles se saltan, igual que hace la API de
 * scoring: una fila con otro contrato no se puede pintar.
 */
async function compatibleRun(): Promise<RunHeader | null> {
  const runs = await prisma.scoreRun.findMany({
    where: { status: "complete" },
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      parameterVersion: true,
      completedAt: true,
      metrics: true,
      parameters: { select: { data: true } },
      forecasts: { take: 1, select: { parameterVersion: true, parameters: true } },
    },
  });
  for (const run of runs) {
    const scoring = parametersSchema.safeParse(run.parameters.data);
    const forecast = run.forecasts[0];
    if (!forecast || !scoring.success || scoring.data.version !== run.parameterVersion) continue;
    const forecastParams = forecastParametersSchema.safeParse(forecast.parameters.data);
    if (
      forecastParams.success &&
      forecastParams.data.version === forecast.parameterVersion &&
      forecastParams.data.versionScoring === run.parameterVersion
    )
      return run;
  }
  return null;
}

const monthOrder = new Map(CALENDAR.map((month, index) => [month, index]));

async function buildDataset(run: RunHeader): Promise<Dataset> {
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
    const point = monthScore(
      score,
      decision === undefined ? null : decisionRowSchema.parse(decision),
      forecast === undefined ? null : forecastRowSchema.parse(forecast),
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

let memo: { key: string; dataset: Promise<Dataset> } | null = null;

function runKey(run: RunHeader): string {
  return `${run.id}:${run.completedAt?.toISOString() ?? ""}`;
}

/**
 * La ejecución vigente, ya traducida. Una consulta ligera por petición para saber
 * si sigue siendo la misma; el parseo pesado solo se repite cuando cambia.
 */
export async function loadDataset(): Promise<Dataset> {
  const run = await compatibleRun().catch((error: unknown) => {
    if (isDatabaseUnreachable(error)) {
      throw new ScoringUnavailableError(
        "No se puede leer la base de datos del motor de scoring (sin conexión o sin esquema)",
      );
    }
    throw error;
  });
  if (!run) {
    memo = null;
    throw new ScoringUnavailableError();
  }
  const key = runKey(run);
  if (memo?.key === key) return memo.dataset;
  const dataset = buildDataset(run);
  memo = { key, dataset };
  dataset.catch(() => {
    if (memo?.key === key) memo = null;
  });
  return dataset;
}
