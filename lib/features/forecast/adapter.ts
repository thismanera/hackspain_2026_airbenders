import type { Previsiones } from "@/lib/features/decision/engine";
import type { PrevisionInput } from "@/lib/features/decision/types";
import { FORECAST_PARAMS as P } from "@/lib/features/forecast/params";
import type { ForecastRow } from "@/lib/features/forecast/types";

/** decision-engine §1: solo el horizonte de 3 meses entra en la decisión. */
export function aPrevision(f: ForecastRow): PrevisionInput {
  return {
    solo: {
      bandaPred3m: f.horizontes[P.horizonteDecision].bandaSoloPred,
      scorePred3m: f.horizontes[P.horizonteDecision].scoreSoloPred,
      direccionPred: f.direccionSoloPred,
      probDeterioro6m: f.probDeterioroSolo6m,
      metodo: f.metodoSolo,
    },
    grupo: {
      bandaPred3m: f.horizontes[P.horizonteDecision].bandaGrupoPred,
      scorePred3m: f.horizontes[P.horizonteDecision].scoreGrupoPred,
      direccionPred: f.direccionGrupoPred,
      probDeterioro6m: f.probDeterioroGrupo6m,
      metodo: f.metodoGrupo,
    },
    ajusteHoldingPred3m: f.horizontes[P.horizonteDecision].ajusteHoldingPred,
    bandaPred3m: f.horizontes[P.horizonteDecision].bandaSoloPred,
    scorePred3m: f.horizontes[P.horizonteDecision].scoreSoloPred,
    direccionPred: f.direccionSoloPred,
    probDeterioro6m: f.probDeterioroSolo6m,
    metodo: f.metodoSolo,
  };
}

export function previsiones(rows: Iterable<ForecastRow>): Previsiones {
  const out: Previsiones = new Map();
  for (const f of rows) out.set(`${f.company}|${f.month}`, aPrevision(f));
  return out;
}
