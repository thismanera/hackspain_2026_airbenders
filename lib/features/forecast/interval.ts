import type { Banda } from "@/lib/features/decision/params";
import {
  FORECAST_PARAMS as P,
  type Horizonte,
  type PDet,
  type Residuos,
} from "@/lib/features/forecast/params";
import type { Direccion } from "@/lib/features/scoring/types";
import { clamp } from "@/lib/features/scoring/windows";

/** Banda de incertidumbre del score previsto, en los mismos puntos que `Residuos`. */
export type Intervalo = { p10: number; p90: number };

/** §4: `[score_pred + p10[h][b], score_pred + p90[h][b]]` acotado a [0, 100]; `b` es la banda en `t`. */
export function intervalo(
  scorePred: number,
  h: Horizonte,
  b: Banda,
  residuos: Residuos,
): Intervalo {
  const r = residuos[h][b];
  return { p10: clamp(scorePred + r.p10, 0, 100), p90: clamp(scorePred + r.p90, 0, 100) };
}

/** §5: mismo umbral que scoring §8, comparando la previsión a 3 meses con el score actual. */
export function direccionPred(scorePred3m: number, score: number): Direccion {
  const d = scorePred3m - score;
  if (d >= P.umbralDireccion) return "mejora";
  if (d <= -P.umbralDireccion) return "deterioro";
  return "estable";
}

/** §5: `P_det[banda(t)][banda_pred_3m]`; null si la tabla no tiene la celda. No es probabilidad de impago. */
export function probDeterioro(b: Banda, bPred: Banda, pDet: PDet): number | null {
  return pDet[b]?.[bPred] ?? null;
}
