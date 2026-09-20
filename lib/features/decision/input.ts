import type { DecisionInput } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";

/**
 * Decisión 43 — la **única** función del motor de decisión que toca `ScoreRow`.
 *
 * Proyecta la fila del score sobre el contrato mínimo (`DecisionInput`): `scoreSolo` (como
 * `score`), pilares, confianza, `estadoSolo` (como `estado`), tendencia, tipos de alerta, lo que
 * define al grupo (`ajusteHolding`) y una sola variable en euros
 * (`tamano = cobrosOpMedia3m`). Todo lo demás del contrato de scoring se queda fuera a propósito:
 * si el motor de decisión necesitase un dato nuevo, se añade aquí y se justifica, no se lee a
 * escondidas desde un paso.
 */
export function proyectar(r: ScoreRow): DecisionInput {
  return {
    company: r.company,
    month: r.month,
    groupId: r.groupId,
    versionScoring: r.versionParametros,
    score: r.scoreSolo,
    confianza: r.confianza,
    subscores: r.subscores,
    estado: r.estadoSolo,
    direccion: r.direccion,
    naturaleza: r.naturaleza,
    tendScore3m: r.tendScore3m,
    tend3m: r.tend3m,
    alertas: r.alertas.map((a) => a.tipo),
    D1: r.D1,
    D5: r.D5,
    ajusteHolding: r.ajusteHolding,
    scoreGrupo: r.scoreGrupo,
    estadoGrupo: r.estadoGrupo,
    requiereAvalMatriz: r.requiereAvalMatriz,
    alertaPignoracionCaja: r.alertaPignoracionCaja,
    revisionStage2Candidata: r.evaluacionEwi.revisionStage2Candidata,
    tamano: r.cobrosOpMedia3m,
  };
}
