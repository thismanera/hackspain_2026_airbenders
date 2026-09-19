import type { Puerta } from "@/lib/features/decision/types";
import { hashParams } from "@/lib/features/scoring/params";

export type Banda = "A" | "B" | "C" | "D";

/** docs/decision-engine.md §2. Ningún número suelto en código. */
export const DECISION_PARAMS = {
  // elegibilidad (decisiones 18, 39, 44)
  confMin: 0.4,
  scoreMin: 45,
  /**
   * Decisión 44: las puertas de fiabilidad, caja y clientes se leen del pilar correspondiente y
   * de su alerta, no de las variables crudas (`rachaB2`, `rachaDeficit`, `C4`), que salen del
   * contrato de entrada con la decisión 43. `B` es fiabilidad, `A` capacidad de deuda/caja y `C`
   * clientes.
   */
  umbralPilar: { A: 50, B: 60, C: 50 },
  // cierre confirmado (decisión 42): las puertas blandas (confianza y la mitad de `caja` que mira
  // el pilar A) necesitan `cierreConfirmadoMeses` meses seguidos para cerrar; el resto cierra ya.
  cierreConfirmadoMeses: 2,
  puertasBlandas: ["historia", "caja"] as readonly Puerta[],
  // límite (11, 12, 45): sin capacidad de cuota. `L` cuelga del tamaño (`cobros_op_media3m`), de
  // la banda, de la confianza y del pilar A. Ver decision-engine §4 y SOURCE §3.1.
  anticipoPct: 0.8,
  anticipoMeses: 3,
  confRef: 0.6,
  /** Decisión 45: `factor_A = min(1, A / factorARef)`; a 70 el pilar A deja de recortar. */
  factorARef: 70,
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
  /** Decisión 46: el menú es una rampa lineal `L × min(1, plazo / rampaDias)`. */
  rampaDias: 180,
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
  // grupo (17, 47)
  D1CrossDefault: 0.3,
  // uso simulado para métricas (§14)
  usoSimulado: 0.6,
  plazoNaturalDefecto: 60,
  revisionStage2PlazoDias: 60,
  alertaPignoracionPlazoMaxDias: 90,
  caidaForecastBloqueoAmpliacion: 5,
  scorePredMinApertura: 45,
  avalMatrizMin: 15,
} as const;
export type DecisionParams = typeof DECISION_PARAMS;

export function hashDecisionParams(p: Record<string, unknown>): string {
  return hashParams(p);
}
