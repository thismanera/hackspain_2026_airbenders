import { createLoader, parseAsString, parseAsStringLiteral } from "nuqs/server";

import { CALENDAR, LATEST_MONTH } from "./calendar";

/**
 * Una sola definición de parsers, compartida por el loader de servidor
 * (`app/(panel)/cartera/page.tsx`) y por `useQueryStates` en el cliente. El
 * estado de los filtros vive en la URL para que un analista pueda pegarle a un
 * compañero el enlace exacto de lo que está mirando.
 */
export const portfolioSearchParams = {
  mes: parseAsStringLiteral(CALENDAR).withDefault(LATEST_MONTH),
  q: parseAsString.withDefault(""),
  estado: parseAsStringLiteral(["todos", "sana", "vigilar", "riesgo", "sin_datos"] as const).withDefault(
    "todos",
  ),
  accion: parseAsStringLiteral([
    "todas",
    "abrir",
    "ampliar",
    "mantener",
    "reducir",
    "cerrar",
  ] as const).withDefault("todas"),
  direccion: parseAsStringLiteral(["todas", "mejora", "estable", "deterioro"] as const).withDefault(
    "todas",
  ),
  banda: parseAsStringLiteral(["todas", "A", "B", "C", "D"] as const).withDefault("todas"),
};

export const loadPortfolioSearchParams = createLoader(portfolioSearchParams);

export type PortfolioSearchState = {
  mes: string;
  q: string;
  estado: "todos" | "sana" | "vigilar" | "riesgo" | "sin_datos";
  accion: "todas" | "abrir" | "ampliar" | "mantener" | "reducir" | "cerrar";
  direccion: "todas" | "mejora" | "estable" | "deterioro";
  banda: "todas" | "A" | "B" | "C" | "D";
};

/** El mes no cuenta como filtro: siempre estás mirando algún mes. */
export function activeFilterCount(state: PortfolioSearchState): number {
  let count = 0;
  if (state.q.trim() !== "") count += 1;
  if (state.estado !== "todos") count += 1;
  if (state.accion !== "todas") count += 1;
  if (state.direccion !== "todas") count += 1;
  if (state.banda !== "todas") count += 1;
  return count;
}

/** La ficha de empresa solo necesita saber qué mes se está mirando. */
export const companySearchParams = {
  mes: parseAsStringLiteral(CALENDAR).withDefault(LATEST_MONTH),
};

export const loadCompanySearchParams = createLoader(companySearchParams);

export const SHEET_TABS = ["decision", "score", "grupo"] as const;
export type SheetTab = (typeof SHEET_TABS)[number];

/**
 * La ficha se abre encima de la cartera, sin abandonarla. Empresa o grupo, y la
 * pestaña, van en la URL: el enlace a "esta empresa, pestaña score" existe.
 */
export const sheetSearchParams = {
  empresa: parseAsString.withDefault(""),
  grupo: parseAsString.withDefault(""),
  pestana: parseAsStringLiteral(SHEET_TABS).withDefault("decision"),
};
