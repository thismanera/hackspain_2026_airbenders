import { capacidadCuotaAdv } from "@/lib/features/decision/limit";
import { motivoPuerta } from "@/lib/features/decision/motivos";
import { DECISION_PARAMS as P } from "@/lib/features/decision/params";
import { PUERTAS, type EstadoDecision, type Puerta } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";

export type Elegibilidad = {
  elegible: boolean;
  motivo: string | null;
  puertasFallidas: Puerta[];
  /**
   * Decisión 42: `caja` junta una condición dura (`racha_deficit`) y una blanda (capacidad de
   * cuota estresada). `true` cuando la puerta falla **solo** por la capacidad: es el único caso en
   * que `caja` cuenta como puerta blanda y el cierre espera confirmación.
   */
  cajaSoloCapacidad: boolean;
};

/** decision-engine §3: seis puertas en orden fijo; la primera que falla es el motivo. */
export function elegibilidad(r: ScoreRow, prev: EstadoDecision): Elegibilidad {
  const rachaOk = r.rachaDeficit <= P.rachaDeficitMax;
  const capacidadOk = capacidadCuotaAdv(r) > 0;
  const ok = {
    historia: r.confianza >= P.confMin,
    estado: r.score >= P.scoreMin,
    fiabilidad: r.rachaB2 <= P.rachaB2Max,
    caja: rachaOk && capacidadOk,
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
    cajaSoloCapacidad: rachaOk && !capacidadOk,
  };
}
