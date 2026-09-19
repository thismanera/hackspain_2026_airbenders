/**
 * Único punto de contacto entre el panel y de dónde salen los datos.
 *
 * Los datos son la última ejecución del motor importada en Postgres
 * (`load-dataset.ts`), consolidada por `derive.ts`. Rutas de API y páginas solo
 * hablan con este fichero; si no hay ejecución compatible, lanza
 * `ScoringUnavailableError` y la UI enseña "motor no disponible".
 */
import {
  alertsFrom,
  backtestFrom,
  benchmarkFrom,
  companyFileFrom,
  groupFileFrom,
  groupsFrom,
  portfolioFrom,
  type PortfolioFilters,
} from "./derive";
import { loadDataset } from "./load-dataset";
import { peerMapFrom } from "./peer-map";
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
export async function getPortfolio(filters: PortfolioFilters = {}): Promise<PortfolioResponse> {
  return portfolioFrom(await loadDataset(), filters);
}

export async function getCompanyFile(
  companyId: string,
  requestedMonth?: string,
): Promise<CompanyFileResponse | null> {
  return companyFileFrom(await loadDataset(), companyId, requestedMonth);
}

export async function getGroupFile(
  groupId: string,
  requestedMonth?: string,
): Promise<GroupFileResponse | null> {
  return groupFileFrom(await loadDataset(), groupId, requestedMonth);
}

export async function getGroups(requestedMonth?: string): Promise<GroupsResponse> {
  return groupsFrom(await loadDataset(), requestedMonth);
}

export async function getAlerts(requestedMonth?: string): Promise<AlertsResponse> {
  return alertsFrom(await loadDataset(), requestedMonth);
}

export async function getBacktest(requestedMonth?: string): Promise<BacktestResponse> {
  return backtestFrom(await loadDataset(), requestedMonth);
}

export async function getBenchmark(
  companyId: string,
  requestedMonth?: string,
): Promise<BenchmarkResponse | null> {
  return benchmarkFrom(await loadDataset(), companyId, requestedMonth);
}

export async function getPeerMap(input: {
  month?: string;
  scope: Scope;
  company?: string;
}): Promise<PeerMapResponse> {
  return peerMapFrom(await loadDataset(), input);
}
