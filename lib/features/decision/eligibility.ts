import { motivoPuerta } from "@/lib/features/decision/motivos";
import { DECISION_PARAMS as P } from "@/lib/features/decision/params";
import {
  PUERTAS,
  type DecisionInput,
  type EstadoDecision,
  type Puerta,
} from "@/lib/features/decision/types";

export type Elegibilidad = {
  elegible: boolean;
  motivo: string | null;
  puertasFallidas: Puerta[];
  /**
   * Decisión 42 + 44: `caja` junta una condición dura (la alerta `deficit_persistente`) y una
   * blanda (el umbral del pilar A). `true` cuando la puerta falla **solo** por el umbral del
   * pilar, no por la alerta: es el único caso en que `caja` cuenta como puerta blanda y el cierre
   * espera confirmación.
   */
  cajaSoloCapacidad: boolean;
};

/**
 * decision-engine §3 (decisión 44): seis puertas en orden fijo; la primera que falla es el motivo.
 *
 * Tres de ellas se leen del **pilar** del score y de su **alerta**, no de la variable cruda:
 * `fiabilidad` de `B` y de `impago_obligaciones`, `caja` de `A` y de `deficit_persistente`,
 * `clientes` de `C` y de `vencido_alto`. Las alertas reproducen 1:1 las puertas crudas que
 * sustituyen (`racha_B2`, `racha_deficit`, `C4`) en el run de 2026-08, y el pilar añade el matiz
 * continuo que el umbral binario no tenía. La puerta de capacidad en euros desaparece: no medía
 * lo mismo que el pilar A y era la que cerraba a media cartera.
 */
export function elegibilidad(r: DecisionInput, prev: EstadoDecision): Elegibilidad {
  const alerta = (t: DecisionInput["alertas"][number]) => r.alertas.includes(t);
  const sinDeficit = !alerta("deficit_persistente");
  const pilarA = r.subscores.A >= P.umbralPilar.A;
  const ok = {
    historia: r.confianza >= P.confMin,
    estado: r.score >= P.scoreMin,
    fiabilidad: !alerta("impago_obligaciones") && r.subscores.B >= P.umbralPilar.B,
    caja: sinDeficit && pilarA,
    clientes: !alerta("vencido_alto") && r.subscores.C >= P.umbralPilar.C,
    grupo: !prev.crossDefaultActivo,
  } satisfies Record<Puerta, boolean>;
  const puertasFallidas = PUERTAS.filter((p) => !ok[p]);
  return {
    elegible: puertasFallidas.length === 0,
    motivo: puertasFallidas.length
      ? motivoPuerta(puertasFallidas[0], r, prev.causaCrossDefault)
      : null,
    puertasFallidas,
    cajaSoloCapacidad: sinDeficit && !pilarA,
  };
}
