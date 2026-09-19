/**
 * Recorte de la previsión para la cartera: lo que la tabla, el mapa y los KPI
 * enseñan de cada empresa. Lo comparten los fixtures y la lectura de Prisma, y
 * no importa nada de base de datos para que los tests de fixtures sigan siendo
 * puros.
 */
import type { ForecastImpact, MonthScore, PortfolioRow, PortfolioSummary } from "./types";

/** Filtro por lo que la previsión dice de la banda a 3 meses. */
export type Prevision = "sube_banda" | "baja_banda" | "mantiene";

const PREVISION_TONE = {
  sube_banda: "mejora",
  baja_banda: "deterioro",
  mantiene: "igual",
} satisfies Record<Prevision, ForecastImpact["tone"]>;

/** Una fila pasa el filtro de previsión si tiene previsión y su tono coincide. */
export function matchesPrevision(row: PortfolioRow, prevision?: Prevision | "todas"): boolean {
  if (!prevision || prevision === "todas") return true;
  return row.forecast !== null && row.forecast.impact.tone === PREVISION_TONE[prevision];
}

export function rowForecast(current: MonthScore): PortfolioRow["forecast"] {
  const forecast = current.forecast;
  if (!forecast) return null;
  return {
    score3m: forecast.scoreSoloPred3m,
    band3m: forecast.bandaSoloPred3m,
    impact: forecast.impact,
  };
}

/** Cuántas cambian de banda a 3 meses y cuánto dinero suma. */
export function summariseForecast(rows: PortfolioRow[]): PortfolioSummary["forecast"] {
  const result = { bandUp: 0, bandDown: 0, annualDelta: 0 };
  for (const row of rows) {
    if (!row.forecast) continue;
    if (row.forecast.impact.tone === "mejora") result.bandUp += 1;
    if (row.forecast.impact.tone === "deterioro") result.bandDown += 1;
    result.annualDelta += row.forecast.impact.annualDelta;
  }
  return result;
}
