import { banda, peor } from "@/lib/features/decision/limit";
import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { DecisionInput } from "@/lib/features/decision/types";

/** decision-engine §5 con la decisión 37: la banda de la tabla es la peor de la actual y la prevista. */
export function tMax(r: DecisionInput, bandaPred: Banda): number {
  const b = peor(banda(r.score), bandaPred);
  const fila = P.tMax[b];
  if (r.direccion !== "deterioro") return fila.base;
  return r.naturaleza === "estructural" ? fila.estructural : fila.temporal;
}
