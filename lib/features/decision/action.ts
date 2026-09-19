import type { Elegibilidad } from "@/lib/features/decision/eligibility";
import { bandaEfectiva, limite, type Limite } from "@/lib/features/decision/limit";
import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { Accion, EstadoDecision } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";

const ORDEN: Banda[] = ["A", "B", "C", "D"];
function esPeor(a: Banda, b: Banda): boolean {
  return ORDEN.indexOf(a) > ORDEN.indexOf(b);
}
function clip(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** §8 + §9: "grupo" es la bajada inmediata por cross-default (caída de una hermana). */
export type CausaReduccion = "estructural" | "confirmada" | "prevision" | "grupo" | null;

export type Decision = {
  accion: Accion;
  L: number;
  LVigente: number;
  bandaEfectiva: Banda;
  limite: Limite;
  causaReduccion: CausaReduccion;
  mesesParaReapertura: number | null;
  escalonesExtra: number;
};

/**
 * decision-engine §8 con la decisión 37. `escalonesExtra` baja la banda por cross-default (§9).
 * No muta `prev`; el estado siguiente lo calcula `siguienteEstado`.
 */
export function decidirAccion(
  r: ScoreRow,
  e: Elegibilidad,
  bandaPred: Banda,
  prev: EstadoDecision,
  escalonesExtra = 0,
): Decision {
  const b = bandaEfectiva(r, escalonesExtra);
  const lim = limite(r, b);
  const L = lim.L;
  const Lp = prev.LPrev;
  const base = {
    L,
    bandaEfectiva: b,
    limite: lim,
    causaReduccion: null,
    mesesParaReapertura: null,
    escalonesExtra,
  } as const;

  if (!e.elegible) return { ...base, accion: "cerrar", LVigente: 0 };

  if (Lp === 0) {
    if (prev.cerradoDesde !== null && prev.mesesElegibleSeguidos + 1 < P.reaperturaMeses)
      return {
        ...base,
        accion: "mantener",
        LVigente: 0,
        mesesParaReapertura: P.reaperturaMeses - prev.mesesElegibleSeguidos - 1,
      };
    return { ...base, accion: L > 0 ? "abrir" : "mantener", LVigente: L };
  }

  const LAcotado = clip(L, Lp * (1 - P.histeresisPct), Lp * (1 + P.histeresisPct));
  const estructural = r.direccion === "deterioro" && r.naturaleza === "estructural";
  if (estructural && L < Lp)
    return { ...base, accion: "reducir", LVigente: L, causaReduccion: "estructural" };

  // §9: la caída de una hermana grande es señal dura como el deterioro estructural: el escalón de
  // banda baja el límite este mismo mes, sin histéresis ni los 2 meses de confirmación.
  if (escalonesExtra > 0 && L < Lp)
    return { ...base, accion: "reducir", LVigente: L, causaReduccion: "grupo" };

  if (esPeor(bandaPred, b) && prev.mesesPredPeorSeguidos + 1 >= P.reducirPrevMeses) {
    const LPred = limite(r, bandaPred).L;
    if (LPred < Lp)
      return {
        ...base,
        accion: "reducir",
        LVigente: Math.max(LPred, Lp * (1 - P.histeresisPct)),
        causaReduccion: "prevision",
      };
  }

  if (L > P.ampliarRatio * Lp && r.direccion !== "deterioro" && !esPeor(bandaPred, b))
    return { ...base, accion: "ampliar", LVigente: LAcotado };

  if (L < P.reducirRatio * Lp) {
    if (prev.mesesReduccionSeguidos + 1 >= P.reducirMeses)
      return { ...base, accion: "reducir", LVigente: LAcotado, causaReduccion: "confirmada" };
    return { ...base, accion: "mantener", LVigente: Lp, causaReduccion: "confirmada" };
  }
  return { ...base, accion: "mantener", LVigente: Lp };
}

/** Actualización del estado tras decidir (§8). */
export function siguienteEstado(
  prev: EstadoDecision,
  d: Decision & { elegible?: boolean },
  r: ScoreRow,
  bandaPred: Banda = "A",
): EstadoDecision {
  const elegible = d.accion !== "cerrar";
  return {
    LPrev: d.LVigente,
    accionPrev: d.accion,
    mesesElegibleSeguidos: elegible ? prev.mesesElegibleSeguidos + 1 : 0,
    mesesReduccionSeguidos:
      prev.LPrev > 0 && d.L < P.reducirRatio * prev.LPrev ? prev.mesesReduccionSeguidos + 1 : 0,
    mesesPredPeorSeguidos: esPeor(bandaPred, d.bandaEfectiva) ? prev.mesesPredPeorSeguidos + 1 : 0,
    cerradoDesde: d.accion === "cerrar" ? r.month : d.accion === "abrir" ? null : prev.cerradoDesde,
    crossDefaultActivo: prev.crossDefaultActivo,
    causaCrossDefault: prev.causaCrossDefault,
  };
}
