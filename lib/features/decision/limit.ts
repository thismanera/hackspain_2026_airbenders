import { redondearAbajo } from "@/lib/features/decision/money";
import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { DecisionInput } from "@/lib/features/decision/types";

/** Bandas de mejor a peor: el orden canónico que usan `peor`, `esPeor` y `bajarBanda`. */
export const ORDEN: readonly Banda[] = ["A", "B", "C", "D"] as const;

export function banda(score: number): Banda {
  if (score >= P.bandas.A) return "A";
  if (score >= P.bandas.B) return "B";
  if (score >= P.bandas.C) return "C";
  return "D";
}

export function scoreForDecision(r: DecisionInput): number {
  return r.scoreDecision ?? r.score;
}

export function bajarBanda(b: Banda, n = 1): Banda {
  return ORDEN[Math.min(ORDEN.length - 1, ORDEN.indexOf(b) + n)];
}

export function peor(a: Banda, b: Banda): Banda {
  return ORDEN[Math.max(ORDEN.indexOf(a), ORDEN.indexOf(b))];
}

/** `true` si `a` es estrictamente peor que `b` (C es peor que B). */
export function esPeor(a: Banda, b: Banda): boolean {
  return ORDEN.indexOf(a) > ORDEN.indexOf(b);
}

/** Banda tras el recorte por deterioro estructural (§4) y por cross-default (§9, `escalonesExtra`). */
export function bandaEfectiva(r: DecisionInput, escalonesExtra = 0): Banda {
  const estructural = r.direccion === "deterioro" && r.naturaleza === "estructural" ? 1 : 0;
  return bajarBanda(banda(scoreForDecision(r)), estructural + escalonesExtra);
}

/**
 * Decisión 45: recorte del límite por el pilar A (capacidad de deuda), `min(1, A / factorARef)`.
 *
 * Sustituye a la capacidad de cuota adversa, que el motor calculaba con sus propios flujos a 6
 * meses y su propio estrés. El pilar A ya mide lo mismo —si la caja aguanta más cuota— sobre las
 * mismas variables, ya normalizado a 0-100 y con la confianza dentro: repetirlo aquí era decidir
 * dos veces con dos umbrales distintos. Por encima de 70 el pilar deja de recortar; por debajo el
 * límite baja proporcionalmente (A 35 ⇒ la mitad).
 */
export function factorA(A: number): number {
  return Math.min(1, Math.max(0, A) / P.factorARef);
}

export type Limite = { limiteOp: number; factorA: number; LBruto: number; L: number };

/**
 * decision-engine §4 (decisión 45):
 *
 * ```text
 * L = anticipo_pct × tamano × anticipo_meses × factor_banda × min(1, conf/conf_ref) × factor_A
 * ```
 *
 * `limiteOp` (= 0,8 × tamaño × 3) se conserva como campo publicado: es el anticipo bruto sobre el
 * circulante y la ficha lo enseña junto al límite recortado.
 */
export function limite(r: DecisionInput, b: Banda): Limite {
  const limiteOp = P.anticipoPct * r.tamano * P.anticipoMeses;
  const factorC = Math.min(1, r.confianza / P.confRef);
  const fA = factorA(r.subscores.A);
  const LBruto = limiteOp * P.factorBanda[b] * factorC * fA;
  return { limiteOp, factorA: fA, LBruto, L: redondearAbajo(LBruto, P.redondeoL) };
}
