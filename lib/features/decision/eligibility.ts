import { motivoPuerta } from "@/lib/features/decision/motivos";
import { DECISION_PARAMS as P } from "@/lib/features/decision/params";
import { PUERTAS, type EstadoDecision, type Puerta } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";

export type Elegibilidad = { elegible: boolean; motivo: string | null; puertasFallidas: Puerta[] };

/** decision-engine §3: seis puertas en orden fijo; la primera que falla es el motivo. */
export function elegibilidad(r: ScoreRow, prev: EstadoDecision): Elegibilidad {
  const ok = {
    historia: r.confianza >= P.confMin,
    estado: r.score >= P.scoreMin,
    fiabilidad: r.rachaB2 <= P.rachaB2Max,
    caja: r.rachaDeficit <= P.rachaDeficitMax && r.capacidadCuotaAdv > 0,
    clientes: r.C4 === null || r.C4 <= P.C4Max,
    grupo: !prev.crossDefaultActivo,
  } satisfies Record<Puerta, boolean>;
  const puertasFallidas = PUERTAS.filter((p) => !ok[p]);
  return {
    elegible: puertasFallidas.length === 0,
    motivo: puertasFallidas.length
      ? motivoPuerta(puertasFallidas[0], r, prev.causaCrossDefault)
      : null,
    puertasFallidas,
  };
}
