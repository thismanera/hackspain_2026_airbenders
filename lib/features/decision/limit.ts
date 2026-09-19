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

export type Limite = { limiteCap: number; limiteOp: number; LBruto: number; L: number };

/** decision-engine §4. La capacidad de cuota adversa viene calculada por scoring (mismos parámetros de estrés). */
export function limite(r: ScoreRow, b: Banda): Limite {
  const limiteCap = r.capacidadCuotaAdv * P.mesesLimiteCap;
  const limiteOp = P.anticipoPct * r.cobrosOpMedia3m * P.anticipoMeses;
  const factorC = Math.min(1, r.confianza / P.confRef);
  const LBruto = Math.min(limiteCap, limiteOp) * P.factorBanda[b] * factorC;
  return { limiteCap, limiteOp, LBruto, L: redondearAbajo(LBruto, P.redondeoL) };
}
