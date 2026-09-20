import type { DecisionInput } from "@/lib/features/decision/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

/**
 * Entrada de decisión sana y completa (decisión 43); los tests sobrescriben solo lo que miden.
 * Solo tests.
 *
 * Números de la fixture `sana` de decision-engine §13: score 82 (banda A), pilares 80, confianza
 * 0,9 y tamaño 100 000 €/mes ⇒ `limite_op` 240 000, `factor_A` 1, `L` 240 000.
 */
export function decisionInputFixture(partial: Partial<DecisionInput> = {}): DecisionInput {
  return {
    company: "c",
    month: CALENDAR[0],
    groupId: "g",
    versionScoring: "v",
    score: 82,
    confianza: 0.9,
    subscores: { A: 80, B: 80, C: 80 },
    estado: "sana",
    direccion: "estable",
    naturaleza: "sin_cambio",
    tendScore3m: null,
    tend3m: { A: null, B: null, C: null },
    alertas: [],
    D1: 1,
    D5: 0,
    ajusteHolding: 0,
    scoreGrupo: 82,
    estadoGrupo: "sana",
    requiereAvalMatriz: false,
    alertaPignoracionCaja: false,
    revisionStage2Candidata: false,
    tamano: 100_000,
    ...partial,
  };
}
