import { createLoader, parseAsArrayOf, parseAsString, parseAsStringLiteral } from "nuqs/server";

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
  estado: parseAsStringLiteral([
    "todos",
    "sana",
    "vigilar",
    "riesgo",
    "sin_datos",
  ] as const).withDefault("todos"),
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
  /** Lo que la previsión dice de la banda dentro de 3 meses. */
  prevision: parseAsStringLiteral([
    "todas",
    "sube_banda",
    "baja_banda",
    "mantiene",
  ] as const).withDefault("todas"),
};

export const loadPortfolioSearchParams = createLoader(portfolioSearchParams);

export type PortfolioSearchState = {
  mes: string;
  q: string;
  estado: "todos" | "sana" | "vigilar" | "riesgo" | "sin_datos";
  accion: "todas" | "abrir" | "ampliar" | "mantener" | "reducir" | "cerrar";
  direccion: "todas" | "mejora" | "estable" | "deterioro";
  banda: "todas" | "A" | "B" | "C" | "D";
  prevision: "todas" | "sube_banda" | "baja_banda" | "mantiene";
};

/** El mes no cuenta como filtro: siempre estás mirando algún mes. */
export function activeFilterCount(state: PortfolioSearchState): number {
  let count = 0;
  if (state.q.trim() !== "") count += 1;
  if (state.estado !== "todos") count += 1;
  if (state.accion !== "todas") count += 1;
  if (state.direccion !== "todas") count += 1;
  if (state.banda !== "todas") count += 1;
  if (state.prevision !== "todas") count += 1;
  return count;
}

export const SHEET_TABS = ["decision", "score", "grupo", "prediccion", "rca"] as const;
export type SheetTab = (typeof SHEET_TABS)[number];

/** La ficha completa: mes y pestaña, las mismas que en la hoja. */
export const companySearchParams = {
  mes: parseAsStringLiteral(CALENDAR).withDefault(LATEST_MONTH),
  pestana: parseAsStringLiteral(SHEET_TABS).withDefault("decision"),
};

export const loadCompanySearchParams = createLoader(companySearchParams);

/**
 * La ficha se abre encima de la cartera, sin abandonarla. Empresa o grupo, y la
 * pestaña, van en la URL: el enlace a "esta empresa, pestaña score" existe.
 */
export const sheetSearchParams = {
  empresa: parseAsString.withDefault(""),
  grupo: parseAsString.withDefault(""),
  pestana: parseAsStringLiteral(SHEET_TABS).withDefault("decision"),
};

/** Páginas que solo necesitan el mes: grupos, alertas, backtest. */
export const monthSearchParams = {
  mes: parseAsStringLiteral(CALENDAR).withDefault(LATEST_MONTH),
};

export const loadMonthSearchParams = createLoader(monthSearchParams);

/** El feed de alertas se filtra por dirección; el resto es la lista entera. */
export const alertsSearchParams = {
  mes: parseAsStringLiteral(CALENDAR).withDefault(LATEST_MONTH),
  direccion: parseAsStringLiteral(["todas", "deterioro", "mejora"] as const).withDefault("todas"),
};

export const loadAlertsSearchParams = createLoader(alertsSearchParams);

export const COMPARE_SLOTS = 3;

/** Hasta tres empresas en la URL: `?empresas=COMP_0001,COMP_0002`. */
export const compareSearchParams = {
  mes: parseAsStringLiteral(CALENDAR).withDefault(LATEST_MONTH),
  empresas: parseAsArrayOf(parseAsString).withDefault([]),
};

export const loadCompareSearchParams = createLoader(compareSearchParams);

/** La vista pyme mira una sola empresa; la primera de la cartera si no se dice cuál. */
export const pymeSearchParams = {
  mes: parseAsStringLiteral(CALENDAR).withDefault(LATEST_MONTH),
  empresa: parseAsString.withDefault("COMP_0357"),
};

export const loadPymeSearchParams = createLoader(pymeSearchParams);
