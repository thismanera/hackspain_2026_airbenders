/**
 * Recorte de la previsión para la cartera: lo que la tabla, los KPI y el filtro
 * necesitan de cada empresa. Lo comparten `derive.ts` (filas completas) y los
 * snapshots materializados (filas ligeras), y no importa nada de base de datos
 * para que los tests con fixtures sigan siendo puros.
 */
import { forecastImpact } from "./forecast-impact";
import type {
  Decision,
  Forecast,
  ForecastImpact,
  MonthScore,
  PortfolioRow,
  PortfolioSummary,
} from "./types";
import { deriveBanda, deriveDireccion } from "./vocabulary";

/** Filtro por lo que la previsión dice de la banda a 3 meses. */
export type Prevision = "sube_banda" | "baja_banda" | "mantiene";

const PREVISION_TONE = {
  sube_banda: "mejora",
  baja_banda: "deterioro",
  mantiene: "igual",
} satisfies Record<Prevision, ForecastImpact["tone"]>;

/** Lo mínimo que hace falta de una fila; `undefined` en snapshots anteriores a la previsión. */
type WithForecast = { forecast?: PortfolioRow["forecast"] };

/** Una fila pasa el filtro de previsión si tiene previsión y su tono coincide. */
export function matchesPrevision(row: WithForecast, prevision?: Prevision | "todas"): boolean {
  if (!prevision || prevision === "todas") return true;
  return row.forecast?.impact?.tone === PREVISION_TONE[prevision];
}

/**
 * Completa campos que los snapshots materializados antes del impacto en euros
 * no traen (`impact`, bandas previstas, intervalo a 6 meses). Así la ficha no
 * exige reimportar el run para no caerse.
 */
export function completeForecast(
  forecast: MonthScore["forecast"],
  decision: Decision,
  scoreNow: number,
): Forecast | null {
  if (!forecast) return null;
  const score3 = forecast.scoreSoloPred3m;
  const score6 = forecast.scoreSoloPred6m;
  return {
    ...forecast,
    bandaSoloPred3m: forecast.bandaSoloPred3m ?? deriveBanda(score3),
    bandaSoloPred6m: forecast.bandaSoloPred6m ?? deriveBanda(score6),
    direccionPred: forecast.direccionPred ?? deriveDireccion(score3 - scoreNow),
    sinTendencia: forecast.sinTendencia ?? false,
    p10Solo6m: forecast.p10Solo6m ?? score6,
    p90Solo6m: forecast.p90Solo6m ?? score6,
    impact: forecast.impact ?? forecastImpact(decision, score3),
  };
}

export function withCompleteForecast(point: MonthScore): MonthScore {
  const forecast = completeForecast(point.forecast, point.decision, point.score);
  return forecast === point.forecast ? point : { ...point, forecast };
}

export function rowForecast(current: MonthScore): PortfolioRow["forecast"] {
  const forecast = completeForecast(current.forecast, current.decision, current.score);
  if (!forecast) return null;
  return {
    score3m: forecast.scoreSoloPred3m,
    band3m: forecast.bandaSoloPred3m,
    impact: forecast.impact,
  };
}

/** Cuántas cambian de banda a 3 meses y cuánto dinero suma. */
export function summariseForecast(rows: WithForecast[]): PortfolioSummary["forecast"] {
  const result = { bandUp: 0, bandDown: 0, annualDelta: 0 };
  for (const row of rows) {
    const impact = row.forecast?.impact;
    if (!impact) continue;
    if (impact.tone === "mejora") result.bandUp += 1;
    if (impact.tone === "deterioro") result.bandDown += 1;
    result.annualDelta += impact.annualDelta;
  }
  return result;
}
