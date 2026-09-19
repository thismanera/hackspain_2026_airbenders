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

async function getJson<T>(url: string, notFound: string, failed: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) throw new Error(notFound);
  if (!res.ok) throw new Error(failed);
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

function toSearch(filters: PortfolioSearchState): string {
  const search = new URLSearchParams({ month: filters.mes });
  if (filters.q.trim()) search.set("q", filters.q.trim());
  if (filters.estado !== "todos") search.set("estado", filters.estado);
  if (filters.accion !== "todas") search.set("accion", filters.accion);
  if (filters.direccion !== "todas") search.set("direccion", filters.direccion);
  if (filters.banda !== "todas") search.set("banda", filters.banda);
  return search.toString();
}

export async function fetchPortfolio(
  filters: PortfolioSearchState,
  baseUrl = "",
): Promise<PortfolioResponse> {
  const res = await fetch(`${baseUrl}/api/portfolio/companies?${toSearch(filters)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("No se ha podido cargar la cartera");
  return res.json();
}

export async function fetchCompanyFile(
  companyId: string,
  month: string,
  baseUrl = "",
): Promise<CompanyFileResponse> {
  const res = await fetch(
    `${baseUrl}/api/portfolio/companies/${encodeURIComponent(companyId)}?month=${month}`,
    { cache: "no-store" },
  );
  if (res.status === 404) throw new Error("Empresa no encontrada");
  if (!res.ok) throw new Error("No se ha podido cargar la ficha");
  return res.json();
}

export async function fetchGroupFile(
  groupId: string,
  month: string,
  baseUrl = "",
): Promise<GroupFileResponse> {
  const res = await fetch(
    `${baseUrl}/api/portfolio/groups/${encodeURIComponent(groupId)}?month=${month}`,
    { cache: "no-store" },
  );
  if (res.status === 404) throw new Error("Grupo no encontrado");
  if (!res.ok) throw new Error("No se ha podido cargar el grupo");
  return res.json();
}
