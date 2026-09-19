import type { Previsiones } from "@/lib/features/decision/engine";
import type { PrevisionInput } from "@/lib/features/decision/types";
import type { ForecastRow } from "@/lib/features/forecast/types";

/** decision-engine §1: solo el horizonte de 3 meses entra en la decisión. */
export function aPrevision(f: ForecastRow): PrevisionInput {
  return {
    bandaPred3m: f.horizontes[3].bandaPred,
    scorePred3m: f.horizontes[3].scorePred,
    direccionPred: f.direccionPred,
    probDeterioro6m: f.probDeterioro6m,
    metodo: f.metodo,
  };
}

export function previsiones(rows: Iterable<ForecastRow>): Previsiones {
  const out: Previsiones = new Map();
  for (const f of rows) out.set(`${f.company}|${f.month}`, aPrevision(f));
  return out;
}
