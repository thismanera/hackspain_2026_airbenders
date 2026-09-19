/**
 * Fachada de datos del panel. Cada respuesta sale de una fila ya materializada
 * en `portfolio_snapshots` por `scoring:import` (ver `snapshots.ts`): una lectura
 * indexada por petición, nada de recalcular sobre el run entero. Los filtros de
 * cartera y el recorte por mes de la ficha se aplican sobre esas filas.
 *
 * Las lecturas pasan por la caché de datos de Next: un run es inmutable, así que
 * sus filas se cachean sin caducidad (la clave lleva el `runId`); qué run está
 * vigente se reconsulta cada minuto. Sin ejecución compatible materializada, o
 * sin base de datos, se lanza `ScoringUnavailableError` (503 / pantalla "motor
 * no disponible"), nunca datos sintéticos.
 */
import { unstable_cache } from "next/cache";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/core/db";

import { ScoringUnavailableError } from "./dataset";
import {
  hasFilters,
  resolveMonth,
  type CohortStats,
  type PortfolioFilters,
  type PortfolioLiteRow,
} from "./derive";
import { compatibleRun, unavailableIfUnreachable, type RunHeader } from "./load-dataset";
import { scopePeerMap } from "./peer-map";
import {
  benchmarkFromSnapshot,
  companyFileFromSnapshot,
  groupKey,
  portfolioFromSnapshot,
  SNAPSHOT_KIND,
  type CompanySnapshot,
  type SnapshotKind,
} from "./snapshots";
import type {
  AlertsResponse,
  BacktestResponse,
  BenchmarkResponse,
  CompanyFileResponse,
  GroupFileResponse,
  GroupsResponse,
  PeerMapResponse,
  PortfolioResponse,
  Scope,
} from "./types";

export { ScoringUnavailableError } from "./dataset";
export type { PortfolioFilters } from "./derive";

const RUN_TTL_SECONDS = 60;

const cachedRun = unstable_cache(
  async (): Promise<RunHeader | null> => compatibleRun().catch(unavailableIfUnreachable),
  ["portfolio-run"],
  { revalidate: RUN_TTL_SECONDS, tags: ["portfolio-run"] },
);

const cachedSnapshot = unstable_cache(
  async (runId: string, kind: SnapshotKind, key: string): Promise<Prisma.JsonValue | null> => {
    const row = await prisma.portfolioSnapshot
      .findUnique({
        where: { runId_kind_key: { runId, kind, key } },
        select: { payload: true },
      })
      .catch(unavailableIfUnreachable);
    return row?.payload ?? null;
  },
  ["portfolio-snapshot"],
  { revalidate: false, tags: ["portfolio-snapshot"] },
);

async function currentRun(): Promise<RunHeader> {
  const run = await cachedRun();
  if (!run) throw new ScoringUnavailableError();
  return run;
}

/** Una fila materializada del run vigente, tipada por quien la pide; `null` si no existe. */
async function snapshot<T>(kind: SnapshotKind, key: string): Promise<T | null> {
  const run = await currentRun();
  const payload = await cachedSnapshot(run.id, kind, key);
  return payload === null ? null : (payload as T);
}

/** Las filas por mes existen para todo el calendario; si falta una, el run está a medias. */
async function monthly<T>(kind: SnapshotKind, requestedMonth?: string): Promise<T> {
  const found = await snapshot<T>(kind, resolveMonth(requestedMonth));
  if (found === null) {
    throw new ScoringUnavailableError(
      "La ejecución vigente no tiene el panel materializado; ejecuta pnpm scoring:import",
    );
  }
  return found;
}

export async function getPortfolio(filters: PortfolioFilters = {}): Promise<PortfolioResponse> {
  const full = await monthly<PortfolioResponse>(SNAPSHOT_KIND.portfolio, filters.month);
  if (!hasFilters(filters)) return full;
  // Con filtro, la historia se recalcula sobre las filas ligeras de los meses anteriores.
  const past = full.months.slice(0, full.months.indexOf(full.month));
  const rows = await Promise.all(
    past.map((month) => snapshot<PortfolioLiteRow[]>(SNAPSHOT_KIND.portfolioLite, month)),
  );
  const lite = new Map(past.map((month, i) => [month, rows[i] ?? []]));
  return portfolioFromSnapshot(full, filters, (month) => lite.get(month) ?? []);
}

export async function getCompanyFile(
  companyId: string,
  requestedMonth?: string,
): Promise<CompanyFileResponse | null> {
  const found = await snapshot<CompanySnapshot>(SNAPSHOT_KIND.company, companyId);
  return found ? companyFileFromSnapshot(found, resolveMonth(requestedMonth)) : null;
}

export async function getGroupFile(
  groupId: string,
  requestedMonth?: string,
): Promise<GroupFileResponse | null> {
  return snapshot<GroupFileResponse>(
    SNAPSHOT_KIND.group,
    groupKey(groupId, resolveMonth(requestedMonth)),
  );
}

export async function getGroups(requestedMonth?: string): Promise<GroupsResponse> {
  return monthly<GroupsResponse>(SNAPSHOT_KIND.groups, requestedMonth);
}

export async function getAlerts(requestedMonth?: string): Promise<AlertsResponse> {
  return monthly<AlertsResponse>(SNAPSHOT_KIND.alerts, requestedMonth);
}

export async function getBacktest(requestedMonth?: string): Promise<BacktestResponse> {
  return monthly<BacktestResponse>(SNAPSHOT_KIND.backtest, requestedMonth);
}

export async function getBenchmark(
  companyId: string,
  requestedMonth?: string,
): Promise<BenchmarkResponse | null> {
  const [company, cohort] = await Promise.all([
    snapshot<CompanySnapshot>(SNAPSHOT_KIND.company, companyId),
    monthly<CohortStats>(SNAPSHOT_KIND.cohort, requestedMonth),
  ]);
  return company ? benchmarkFromSnapshot(company, cohort) : null;
}

export async function getPeerMap(input: {
  month?: string;
  scope: Scope;
  company?: string;
}): Promise<PeerMapResponse> {
  const full = await monthly<PeerMapResponse>(SNAPSHOT_KIND.peers, input.month);
  return scopePeerMap(full, input);
}
