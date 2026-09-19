import type { Banda } from "./types";
import { BANDA, deriveBanda } from "./vocabulary";

/** Umbral inferior de cada banda (SOURCE §2.1). D no tiene suelo: es "lo demás". */
const BAND_FLOOR = { A: 75, B: 60, C: 45 } satisfies Partial<Record<Banda, number>>;

export type BandStep = {
  band: Banda;
  /** Puntos de score que faltan para entrar en esa banda, ya redondeados a un decimal. */
  pointsMissing: number;
  baseApr: number;
  maxTenor: number;
  factor: number;
};

/**
 * La banda inmediatamente mejor que la actual y lo que cambiaría al llegar a
 * ella. Es la respuesta a "qué lo movería" (PRODUCT §8.3): un 68 no dice nada,
 * pero "te faltan 7 puntos para bajar la TAE base del 7 % al 5 %" sí.
 */
export function nextBand(score: number): BandStep | null {
  const current = deriveBanda(score);
  if (current === "A") return null;
  const band: Banda = current === "D" ? "C" : current === "C" ? "B" : "A";
  const floor = BAND_FLOOR[band];
  return {
    band,
    pointsMissing: Math.max(0.1, Math.round((floor - score) * 10) / 10),
    baseApr: BANDA[band].baseApr,
    maxTenor: BANDA[band].maxTenor,
    factor: BANDA[band].factor,
  };
}

/** Umbral por debajo del cual la empresa caería a la banda inferior; `null` en D. */
export function bandFloor(score: number): number | null {
  const current = deriveBanda(score);
  return current === "D" ? null : BAND_FLOOR[current];
}
