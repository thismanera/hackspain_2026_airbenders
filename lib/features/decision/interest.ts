import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { DesgloseTae } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";

const ORDEN: Banda[] = ["A", "B", "C", "D"];

export type Tae = { tae: number; desglose: DesgloseTae } | { tae: null; desglose: null };

/** decision-engine §6 (+ prima de previsión, decisión 37). Redondeo a 4 decimales. */
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
    primaPrevision: ORDEN.indexOf(bandaPred) > ORDEN.indexOf(bEfectiva) ? P.primaPrevisionPp : 0,
  };
  const total = Object.values(desglose).reduce((a, b) => a + b, 0);
  return { tae: Math.round(total * 1e4) / 1e4, desglose };
}

export function coste(cantidad: number, taeAnual: number, plazoDias: number): number {
  return Math.round(((cantidad * taeAnual * plazoDias) / P.baseDias) * 100) / 100;
}
