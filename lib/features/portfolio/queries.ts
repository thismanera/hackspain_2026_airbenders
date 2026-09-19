import type { CompanyFileResponse, GroupFileResponse, PortfolioResponse } from "./types";
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
};

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
