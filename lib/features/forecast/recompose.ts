import { FORECAST_PARAMS as P } from "@/lib/features/forecast/params";
import type { Driver } from "@/lib/features/forecast/types";
import { aggregate, type Aggregated } from "@/lib/features/scoring/aggregate";
import { avalGrupo } from "@/lib/features/scoring/group";
import type {
  Contribution,
  Percentiles,
  ScoreRow,
  VariableSet,
} from "@/lib/features/scoring/types";
import { clamp, sum } from "@/lib/features/scoring/windows";

/** §3.3: las mismas funciones de scoring §6 sobre las variables proyectadas. */
export function recomponer(
  vars: VariableSet,
  rachaB2Prev: number[],
  percentiles: Percentiles,
): Aggregated {
  return aggregate(vars, { rachaB2Prev }, percentiles);
}

export type Hermana = { row: ScoreRow; scoreSoloPred: number };

/**
 * D2 previsto sin `cobrosOp12m` (no viaja en `ScoreRow`): `D1` de cada hermana es proporcional a
 * sus cobros de 12 m con el mismo denominador, así que `D2_pred = D2 + media ponderada por D1 de
 * (scoreSolo_pred − scoreSolo)`. Sin hermanas con cobros, media simple; `D2 = null` sigue null.
 */
export function d2Pred(me: ScoreRow, hermanas: Hermana[]): number | null {
  if (me.D2 === null) return null;
  if (!hermanas.length) return me.D2;
  const peso = sum(hermanas.map((h) => h.row.D1));
  const deltas = hermanas.map((h) => h.scoreSoloPred - h.row.scoreSolo);
  const delta =
    peso > 0
      ? sum(hermanas.map((h, i) => deltas[i] * h.row.D1)) / peso
      : sum(deltas) / hermanas.length;
  return me.D2 + delta;
}

/** scoring §7 con el D2 previsto; D3 y D5 constantes (§3.2). */
export function scorePred(scoreSoloPred: number, me: ScoreRow, D2pred: number | null): number {
  return clamp(scoreSoloPred + avalGrupo(scoreSoloPred, D2pred, me.D3, me.D5), 0, 100);
}

/** Cascada prevista: A1..C6 más la fila `grupo`, mismo formato que `ScoreRow.variables`. */
export function cascada(
  agg: Aggregated,
  me: ScoreRow,
  D2pred: number | null,
  score: number,
): Contribution[] {
  return [
    ...agg.contributions,
    {
      id: "grupo",
      raw: D2pred,
      subnota: D2pred ?? 50,
      conf: me.confD,
      aportacion: score - agg.scoreSolo,
      umbralSano: null,
      sano: null,
    },
  ];
}

/** §3.4: las `nDrivers` entradas (variables o `grupo`) con mayor |Δ aportación|; empate por id. */
export function drivers(actual: Contribution[], pred: Contribution[]): Driver[] {
  const byId = new Map(actual.map((c) => [c.id, c]));
  return pred
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
      (x, y) => Math.abs(y.deltaAportacion) - Math.abs(x.deltaAportacion) || (x.id < y.id ? -1 : 1),
    )
    .slice(0, P.nDrivers);
}
