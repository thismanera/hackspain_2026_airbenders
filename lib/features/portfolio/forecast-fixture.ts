/**
 * Previsión para los fixtures: la misma proyección v1 del motor
 * (docs/forecast-engine.md §3: tendencia mediana amortiguada y acotada) aplicada
 * al score sintético, para que las pantallas enseñen la previsión también sin
 * base de datos. Es determinista y se calcula al construir la cartera, no en la
 * UI. Va en modo sombra como la v1 real: informa, no decide.
 */
import { FORECAST_PARAMS } from "@/lib/features/forecast/params";
import { proyectar, tendencia } from "@/lib/features/forecast/trend";

import { forecastImpact } from "./forecast-impact";
import type { Forecast, MonthScore } from "./types";
import { deriveBanda, deriveDireccion } from "./vocabulary";

/**
 * Semiancho del intervalo p10–p90 del residuo de la v1 sobre el dataset real
 * (docs/forecast-engine.md §9: MAE 3,7 a 3 meses y 5,9 a 6). Para un residuo
 * simétrico el 80 % central cae a ±1,6 × MAE.
 */
const HALF_WIDTH = { 3: 6, 6: 9.5 } as const;

/** El score vive en 0–100; no hay percentiles de ajuste que estrechen más. */
const CLIP = { p1: 0, p99: 100 };

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

export function fixtureForecast(
  months: Pick<MonthScore, "score" | "decision">[],
  index: number,
): Forecast {
  const current = months[index]!;
  const window = months
    .slice(Math.max(0, index - FORECAST_PARAMS.ventanaTendencia + 1), index + 1)
    .map((month) => month.score);
  const { tendencia: slope, sinTendencia } = tendencia(window);

  const pred3 = clamp(proyectar(current.score, slope, 3, CLIP));
  const pred6 = clamp(proyectar(current.score, slope, 6, CLIP));

  return {
    scoreSoloPred3m: pred3,
    scoreGrupoPred3m: pred3,
    scoreSoloPred6m: pred6,
    scoreGrupoPred6m: pred6,
    p10Solo3m: clamp(pred3 - HALF_WIDTH[3]),
    p90Solo3m: clamp(pred3 + HALF_WIDTH[3]),
    p10Grupo3m: clamp(pred3 - HALF_WIDTH[3]),
    p90Grupo3m: clamp(pred3 + HALF_WIDTH[3]),
    p10Solo6m: clamp(pred6 - HALF_WIDTH[6]),
    p90Solo6m: clamp(pred6 + HALF_WIDTH[6]),
    bandaSoloPred3m: deriveBanda(pred3),
    bandaSoloPred6m: deriveBanda(pred6),
    direccionPred: deriveDireccion(pred3 - current.score),
    sinTendencia,
    metodoSolo: "desconectado",
    metodoGrupo: "desconectado",
    impact: forecastImpact(current.decision, pred3),
  };
}
