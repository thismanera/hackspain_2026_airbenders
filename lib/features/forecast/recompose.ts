import { FORECAST_PARAMS as P } from "@/lib/features/forecast/params";
import type { Driver, ForecastContribution, Hermana } from "@/lib/features/forecast/types";
import { aggregate, type Aggregated } from "@/lib/features/scoring/aggregate";
import type { Extras, Percentiles, ScoreRow, VariableSet } from "@/lib/features/scoring/types";
import { clamp, sum } from "@/lib/features/scoring/windows";

export function recomponer(
  vars: VariableSet,
  rachaB2Prev: number[],
  percentiles: Percentiles,
  cobertura: Pick<Extras["cobertura"], "tieneCuotas" | "tieneLineaCredito" | "hardcoreRevolving">,
): Aggregated {
  return aggregate(vars, { rachaB2Prev }, percentiles, cobertura);
}

export function d2Pred(me: ScoreRow, hermanas: Hermana[]): number | null {
  if (me.D2 === null) return null;
  if (!hermanas.length) return me.D2;
  const peso = sum(hermanas.map((h) => h.row.D1));
  const delta =
    peso > 0
      ? sum(hermanas.map((h) => (h.scoreSoloPred - h.row.scoreSolo) * h.row.D1)) / peso
      : sum(hermanas.map((h) => h.scoreSoloPred - h.row.scoreSolo)) / hermanas.length;
  return clamp(me.D2 + delta, 0, 100);
}

export function holdingContribution(
  actual: ScoreRow,
  predictedAdjustment: number,
  d2Predicted: number | null,
): ForecastContribution {
  return {
    id: "holding",
    raw: d2Predicted,
    subnota: d2Predicted,
    conf: actual.confD,
    peso: 0,
    pesoEfectivo: 0,
    aportacion: predictedAdjustment,
    umbralSano: null,
    sano: null,
    aplicable: predictedAdjustment !== 0 || d2Predicted !== null,
  };
}

export function drivers(
  actual: ForecastContribution[],
  predicted: ForecastContribution[],
): Driver[] {
  const byId = new Map(actual.map((c) => [c.id, c]));
  return predicted
    .map((c) => {
      const a = byId.get(c.id);
      return {
        id: c.id,
        valorActual: a?.raw ?? null,
        valorPred: c.raw,
        deltaAportacion: c.aportacion - (a?.aportacion ?? c.aportacion),
      };
    })
    .sort(
      (a, b) =>
        Math.abs(b.deltaAportacion) - Math.abs(a.deltaAportacion) || a.id.localeCompare(b.id),
    )
    .slice(0, P.nDrivers);
}
