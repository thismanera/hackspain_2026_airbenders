import { DECISION_PARAMS as P } from "@/lib/features/decision/params";
import type { ScoreRow } from "@/lib/features/scoring/types";

type Flujos = Pick<ScoreRow, "cobrosOpMedia6m" | "pagosOpMedia6m" | "servicioDeudaMedia6m">;

/**
 * Flujos operativos que dan exactamente `cap` €/mes de capacidad de cuota adversa con el estrés
 * propio del motor de decisión (§4, decisión 40). Los tests que antes fijaban `capacidadCuotaAdv`
 * en la fila de score fijan ahora los flujos de los que el motor la deriva: la fila de score ya no
 * manda sobre el límite. Solo tests.
 */
export function flujosCapacidad(cap: number): Flujos {
  return {
    cobrosOpMedia6m: (cap * P.coberturaMin) / P.estresCobros,
    pagosOpMedia6m: 0,
    servicioDeudaMedia6m: 0,
  };
}
