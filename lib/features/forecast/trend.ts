import { type ClipVar, FORECAST_PARAMS as P } from "@/lib/features/forecast/params";
import { median } from "@/lib/features/scoring/windows";

export type Tendencia = { tendencia: number; sinTendencia: boolean };

/**
 * §3.1: mediana de los deltas entre meses consecutivos con ambas observaciones. Con menos de
 * `minMesesTendencia − 1` deltas no hay tendencia (0) y la variable se marca `sinTendencia`.
 */
export function tendencia(serie: readonly (number | null)[]): Tendencia {
  const deltas: number[] = [];
  for (let i = 1; i < serie.length; i++) {
    const a = serie[i - 1];
    const b = serie[i];
    if (a !== null && b !== null) deltas.push(b - a);
  }
  if (deltas.length < P.minMesesTendencia - 1) return { tendencia: 0, sinTendencia: true };
  return { tendencia: median(deltas)!, sinTendencia: false };
}

/** `Σ_{i=1..h} amortiguacion[i]` (§3.2). Más allá de la tabla se repite el último factor. */
export function acumulada(h: number): number {
  let s = 0;
  for (let i = 0; i < h; i++) s += P.amortiguacion[i] ?? P.amortiguacion[P.amortiguacion.length - 1];
  return s;
}

/**
 * `x(t+h) = clip(x(t) + tendencia · acumulada(h), p1, p99)`. El clip se ensancha hasta `x(t)`:
 * una variable ya fuera del rango de ajuste no se mueve si su tendencia es cero (propiedad 2 §10).
 */
export function proyectar(x0: number, tend: number, h: number, clip?: ClipVar): number {
  let x = x0 + tend * acumulada(h);
  if (clip) {
    if (clip.p1 !== null) x = Math.max(Math.min(clip.p1, x0), x);
    if (clip.p99 !== null) x = Math.min(Math.max(clip.p99, x0), x);
  }
  return x;
}
