import { hashParams } from "@/lib/features/scoring/params";

export type Banda = "A" | "B" | "C" | "D";

/** docs/decision-engine.md §2. Ningún número suelto en código. */
export const DECISION_PARAMS = {
  // elegibilidad (decisión 18)
  confMin: 0.5,
  scoreMin: 45,
  rachaB2Max: 1,
  rachaDeficitMax: 2,
  C4Max: 0.4,
  // capacidad y límite (11, 12): la capacidad de cuota adversa la calcula scoring con los mismos
  // parámetros de estrés (PARAMS.estresCobros/estresPagos/coberturaMin) y llega en ScoreRow.
  mesesLimiteCap: 12,
  anticipoPct: 0.8,
  anticipoMeses: 3,
  confRef: 0.6,
  redondeoL: 1000,
  // bandas (12, 21)
  bandas: { A: 75, B: 60, C: 45 } as Readonly<Record<"A" | "B" | "C", number>>,
  factorBanda: { A: 1, B: 0.7, C: 0.4, D: 0 } as Readonly<Record<Banda, number>>,
  baseTAE: { A: 0.05, B: 0.07, C: 0.1, D: null } as Readonly<Record<Banda, number | null>>,
  // plazo (20)
  tMax: {
    A: { base: 180, temporal: 120, estructural: 60 },
    B: { base: 120, temporal: 90, estructural: 30 },
    C: { base: 60, temporal: 30, estructural: 0 },
    D: { base: 0, temporal: 0, estructural: 0 },
  } as Readonly<Record<Banda, Readonly<{ base: number; temporal: number; estructural: number }>>>,
  plazosMenu: [30, 60, 90, 120, 180] as readonly number[],
  // interés (21, 37)
  primaPlazoPp30d: 0.005,
  primaConfianzaPp: 0.01,
  confPrima: 0.7,
  ajusteMejoraPp: -0.005,
  ajusteDeterioroPp: 0.01,
  primaPrevisionPp: 0.005,
  baseDias: 360,
  // revisión mensual (12, 23, 37)
  ampliarRatio: 1.15,
  reducirRatio: 0.85,
  reducirMeses: 2,
  reducirPrevMeses: 2,
  histeresisPct: 0.25,
  reaperturaMeses: 2,
  // grupo (17)
  D1CrossDefault: 0.3,
  // uso simulado para métricas (§14)
  usoSimulado: 0.6,
  plazoNaturalDefecto: 60,
} as const;
export type DecisionParams = typeof DECISION_PARAMS;

export function hashDecisionParams(p: Record<string, unknown>): string {
  return hashParams(p);
}
