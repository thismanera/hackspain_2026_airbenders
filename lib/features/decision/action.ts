import type { Elegibilidad } from "@/lib/features/decision/eligibility";
import { banda, bandaEfectiva, esPeor, limite, type Limite } from "@/lib/features/decision/limit";
import { redondearAbajo, redondearArriba } from "@/lib/features/decision/money";
import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { Accion, EstadoDecision } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";

function clip(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Banda de histéresis del mes, ya en el grid de `redondeo_L`: el techo se redondea abajo y el
 * suelo arriba para que ningún `L_vigente` salga de la histéresis con un importe fuera del grid
 * (y para que el redondeo nunca afloje el límite de ±25 %).
 */
function techoHisteresis(Lp: number): number {
  return redondearAbajo(Lp * (1 + P.histeresisPct), P.redondeoL);
}
function sueloHisteresis(Lp: number): number {
  return redondearArriba(Lp * (1 - P.histeresisPct), P.redondeoL);
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

  // No elegible: ni límite recomendado ni vigente (§13, propiedad 1). `limite` se conserva en
  // `limiteCap`/`limiteOp` porque la ficha enseña la capacidad aunque la puerta cierre.
  if (!e.elegible) return { ...base, accion: "cerrar", L: 0, LVigente: 0 };

  if (Lp === 0) {
    if (prev.cerradoDesde !== null && prev.mesesElegibleSeguidos + 1 < P.reaperturaMeses)
      return {
        ...base,
        accion: "mantener",
        LVigente: 0,
        mesesParaReapertura: P.reaperturaMeses - prev.mesesElegibleSeguidos - 1,
      };
    // Desviación deliberada de §8: con L = 0 no hay nada que abrir (banda D o capacidad nula),
    // así que la fila sale como `mantener` en 0 en vez de un `abrir` vacío.
    return { ...base, accion: L > 0 ? "abrir" : "mantener", LVigente: L };
  }

  const LAcotado = clip(L, sueloHisteresis(Lp), techoHisteresis(Lp));
  const estructural = r.direccion === "deterioro" && r.naturaleza === "estructural";
  if (estructural && L < Lp)
    return { ...base, accion: "reducir", LVigente: L, causaReduccion: "estructural" };

  // §9: la caída de una hermana grande es señal dura como el deterioro estructural: el escalón de
  // banda baja el límite este mismo mes, sin histéresis ni los 2 meses de confirmación.
  if (escalonesExtra > 0 && L < Lp)
    return { ...base, accion: "reducir", LVigente: L, causaReduccion: "grupo" };

  // SOURCE §3.6 y decisión 37: la comparación es siempre contra la banda **actual**, no la
  // efectiva. Si comparase con la efectiva, un deterioro estructural (o un escalón de
  // cross-default) que ya bajó la banda taparía la señal de la previsión.
  const bActual = banda(r.score);
  if (esPeor(bandaPred, bActual) && prev.mesesPredPeorSeguidos + 1 >= P.reducirPrevMeses) {
    const LPred = limite(r, bandaPred).L;
    if (LPred < Lp)
      return {
        ...base,
        accion: "reducir",
        LVigente: Math.max(LPred, sueloHisteresis(Lp)),
        causaReduccion: "prevision",
      };
  }

  if (L > P.ampliarRatio * Lp && r.direccion !== "deterioro" && !esPeor(bandaPred, bActual))
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
  d: Decision,
  r: ScoreRow,
  bandaPred: Banda,
): EstadoDecision {
  const elegible = d.accion !== "cerrar";
  return {
    LPrev: d.LVigente,
    accionPrev: d.accion,
    mesesElegibleSeguidos: elegible ? prev.mesesElegibleSeguidos + 1 : 0,
    mesesReduccionSeguidos:
      prev.LPrev > 0 && d.L < P.reducirRatio * prev.LPrev ? prev.mesesReduccionSeguidos + 1 : 0,
    // Misma comparación que en `decidirAccion`: banda prevista contra la banda actual (§3.6).
    mesesPredPeorSeguidos: esPeor(bandaPred, banda(r.score)) ? prev.mesesPredPeorSeguidos + 1 : 0,
    cerradoDesde: d.accion === "cerrar" ? r.month : d.accion === "abrir" ? null : prev.cerradoDesde,
    // El bloque de cross-default lo recalcula el motor (§9) con el mes del grupo ya cerrado.
    crossDefaultActivo: prev.crossDefaultActivo,
    causaCrossDefault: prev.causaCrossDefault,
    mesesConCrossDefault: prev.mesesConCrossDefault,
  };
}
