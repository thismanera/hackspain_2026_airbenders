import { redondearAbajo } from "@/lib/features/decision/money";
import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { ScoreRow } from "@/lib/features/scoring/types";

/** Bandas de mejor a peor: el orden canónico que usan `peor`, `esPeor` y `bajarBanda`. */
export const ORDEN: readonly Banda[] = ["A", "B", "C", "D"] as const;

export function banda(score: number): Banda {
  if (score >= P.bandas.A) return "A";
  if (score >= P.bandas.B) return "B";
  if (score >= P.bandas.C) return "C";
  return "D";
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
export function bandaEfectiva(r: ScoreRow, escalonesExtra = 0): Banda {
  const estructural = r.direccion === "deterioro" && r.naturaleza === "estructural" ? 1 : 0;
  return bajarBanda(banda(r.score), estructural + escalonesExtra);
}

/**
 * decision-engine §4 + decisión 40: la capacidad de cuota adversa la calcula **este** motor con
 * **su** escenario de estrés (−10 % cobros / +5 % pagos, cobertura 1,3), no la de `ScoreRow`, que
 * scoring calcula con −20 %/+10 % para D3 del aval de grupo. Son dos escenarios adversos distintos
 * a propósito: el de scoring mide si el padre puede avalar (conservador sobre un dato ajeno), este
 * mide cuánto se le puede prestar a la empresa sobre sus propios cobros, ya infravalorados por el
 * 25 % de movimientos sin clasificar.
 */
export function capacidadCuotaAdv(r: ScoreRow): number {
  const cajaAdv = P.estresCobros * r.cobrosOpMedia6m - P.estresPagos * r.pagosOpMedia6m;
  return Math.max(0, cajaAdv / P.coberturaMin - r.servicioDeudaMedia6m);
}

export type Limite = { limiteCap: number; limiteOp: number; LBruto: number; L: number };

/** decision-engine §4. */
export function limite(r: ScoreRow, b: Banda): Limite {
  const limiteCap = capacidadCuotaAdv(r) * P.mesesLimiteCap;
  const limiteOp = P.anticipoPct * r.cobrosOpMedia3m * P.anticipoMeses;
  const factorC = Math.min(1, r.confianza / P.confRef);
  const LBruto = Math.min(limiteCap, limiteOp) * P.factorBanda[b] * factorC;
  return { limiteCap, limiteOp, LBruto, L: redondearAbajo(LBruto, P.redondeoL) };
}
