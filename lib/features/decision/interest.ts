import { banda, esPeor } from "@/lib/features/decision/limit";
import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { DesgloseTae } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";

export type Tae = { tae: number; desglose: DesgloseTae } | { tae: null; desglose: null };

/**
 * decision-engine §6 (+ prima de previsión, decisión 37). Redondeo a 4 decimales.
 *
 * La prima de previsión compara la banda prevista con la banda **actual** (`banda(r.score)`), no
 * con la efectiva (SOURCE §3.3: "+0,5 pp si banda_pred_3m < banda actual"). Si comparase con la
 * efectiva, un deterioro estructural que ya bajó la banda taparía la señal de la previsión.
 */
export function tae(bEfectiva: Banda, plazoDias: number, r: ScoreRow, bandaPred: Banda): Tae {
  const base = P.baseTAE[bEfectiva];
  if (base === null) return { tae: null, desglose: null };
  const desglose: DesgloseTae = {
    base,
    primaPlazo: P.primaPlazoPp30d * Math.max(0, Math.ceil((plazoDias - 30) / 30)),
    primaConfianza: r.confianza < P.confPrima ? P.primaConfianzaPp : 0,
    ajusteTendencia:
      r.direccion === "mejora"
        ? P.ajusteMejoraPp
        : r.direccion === "deterioro"
          ? P.ajusteDeterioroPp
          : 0,
    primaPrevision: esPeor(bandaPred, banda(r.score)) ? P.primaPrevisionPp : 0,
  };
  const total =
    desglose.base +
    desglose.primaPlazo +
    desglose.primaConfianza +
    desglose.ajusteTendencia +
    desglose.primaPrevision;
  return { tae: Math.round(total * 1e4) / 1e4, desglose };
}

/** §6: coste de la operación, redondeado a céntimos (es un importe en € que la ficha enseña). */
export function coste(cantidad: number, taeAnual: number, plazoDias: number): number {
  return Math.round(((cantidad * taeAnual * plazoDias) / P.baseDias) * 100) / 100;
}
