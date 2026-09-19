import { z } from "zod";

import type { Reading, ReadingKind } from "./reading";
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
import type { PortfolioSearchState } from "./search-params";

/** Código estable de la API cuando no hay ejecución del motor compatible (HTTP 503). */
export const SCORING_UNAVAILABLE = "SCORING_UNAVAILABLE";

const errorBodySchema = z.object({ code: z.string().optional() });

/**
 * Query keys tipadas. El prefetch del servidor y el hook del cliente comparten
 * exactamente esta función: si divergen, `HydrationBoundary` se rompe en
 * silencio y la página parpadea al hidratar.
 */
export const portfolioKeys = {
  all: ["portfolio"] as const,
  list: (filters: PortfolioSearchState) => ["portfolio", "list", filters] as const,
  company: (companyId: string, month: string) =>
    ["portfolio", "company", companyId, month] as const,
  group: (groupId: string, month: string) => ["portfolio", "group", groupId, month] as const,
  groups: (month: string) => ["portfolio", "groups", month] as const,
  alerts: (month: string) => ["portfolio", "alerts", month] as const,
  backtest: (month: string) => ["portfolio", "backtest", month] as const,
  benchmark: (companyId: string, month: string) =>
    ["portfolio", "benchmark", companyId, month] as const,
  peers: (month: string, scope: Scope, companyId?: string) =>
    ["portfolio", "peers", month, scope, companyId ?? ""] as const,
  reading: (companyId: string, month: string, kind: string) =>
    ["portfolio", "reading", companyId, month, kind] as const,
};

export function fetchPeers(
  month: string,
  scope: Scope,
  companyId?: string,
  baseUrl = "",
): Promise<PeerMapResponse> {
  const params = new URLSearchParams({ month, scope });
  if (companyId) params.set("empresa", companyId);
  return getJson(
    `${baseUrl}/api/portfolio/peers?${params}`,
    "Empresa no encontrada",
    "No se ha podido cargar el espacio de pares",
  );
}

/** Error de la API del panel con el código estable que devuelve la ruta (503 → motor no disponible). */
export class PortfolioApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "PortfolioApiError";
  }
}

export function isScoringUnavailable(error: unknown): boolean {
  return error instanceof PortfolioApiError && error.code === SCORING_UNAVAILABLE;
}

async function fail(res: Response, notFound: string, failed: string): Promise<never> {
  const body: unknown = await res.json().catch(() => null);
  const parsed = errorBodySchema.safeParse(body);
  const code = parsed.success ? (parsed.data.code ?? null) : null;
  if (code === SCORING_UNAVAILABLE) {
    throw new PortfolioApiError("Motor de scoring no disponible", res.status, code);
  }
  throw new PortfolioApiError(res.status === 404 ? notFound : failed, res.status, code);
}

async function getJson<T>(url: string, notFound: string, failed: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return fail(res, notFound, failed);
  return res.json();
}

export function fetchGroups(month: string, baseUrl = ""): Promise<GroupsResponse> {
  return getJson(
    `${baseUrl}/api/portfolio/groups?month=${month}`,
    "Sin grupos",
    "No se han podido cargar los grupos",
  );
}

export function fetchAlerts(month: string, baseUrl = ""): Promise<AlertsResponse> {
  return getJson(
    `${baseUrl}/api/portfolio/alerts?month=${month}`,
    "Sin alertas",
    "No se han podido cargar las alertas",
  );
}

export function fetchBacktest(month: string, baseUrl = ""): Promise<BacktestResponse> {
  return getJson(
    `${baseUrl}/api/portfolio/backtest?month=${month}`,
    "Sin backtest",
    "No se ha podido cargar el backtest",
  );
}

export function fetchBenchmark(
  companyId: string,
  month: string,
  baseUrl = "",
): Promise<BenchmarkResponse> {
  return getJson(
    `${baseUrl}/api/portfolio/companies/${encodeURIComponent(companyId)}/benchmark?month=${month}`,
    "Empresa no encontrada",
    "No se ha podido cargar el benchmark",
  );
}

export function fetchReading(
  companyId: string,
  month: string,
  kind: ReadingKind,
  baseUrl = "",
): Promise<Reading> {
  return getJson(
    `${baseUrl}/api/portfolio/companies/${encodeURIComponent(companyId)}/reading?month=${month}&kind=${kind}`,
    "Empresa no encontrada",
    "No se ha podido cargar la lectura",
  );
}

function toSearch(filters: PortfolioSearchState): string {
  const search = new URLSearchParams({ month: filters.mes });
  if (filters.q.trim()) search.set("q", filters.q.trim());
  if (filters.estado !== "todos") search.set("estado", filters.estado);
  if (filters.accion !== "todas") search.set("accion", filters.accion);
  if (filters.direccion !== "todas") search.set("direccion", filters.direccion);
  if (filters.banda !== "todas") search.set("banda", filters.banda);
  return search.toString();
}

export function fetchPortfolio(
  filters: PortfolioSearchState,
  baseUrl = "",
): Promise<PortfolioResponse> {
  return getJson(
    `${baseUrl}/api/portfolio/companies?${toSearch(filters)}`,
    "Sin cartera",
    "No se ha podido cargar la cartera",
  );
}

export function fetchCompanyFile(
  companyId: string,
  month: string,
  baseUrl = "",
): Promise<CompanyFileResponse> {
  return getJson(
    `${baseUrl}/api/portfolio/companies/${encodeURIComponent(companyId)}?month=${month}`,
    "Empresa no encontrada",
    "No se ha podido cargar la ficha",
  );
}

export function fetchGroupFile(
  groupId: string,
  month: string,
  baseUrl = "",
): Promise<GroupFileResponse> {
  return getJson(
    `${baseUrl}/api/portfolio/groups/${encodeURIComponent(groupId)}?month=${month}`,
    "Grupo no encontrado",
    "No se ha podido cargar el grupo",
  );
}
