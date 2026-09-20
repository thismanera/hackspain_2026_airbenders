import assert from "node:assert/strict";
import test from "node:test";

import { submissionRowSchema } from "@/lib/features/submission/contracts";
import {
  submissionCsv,
  submissionJsonl,
  submissionSummary,
} from "@/lib/features/submission/format";
import type { SubmissionRow } from "@/lib/features/submission/types";

function row(overrides: Partial<SubmissionRow> = {}): SubmissionRow {
  return {
    company_id: "COMP_001",
    month: "2026-08",
    group_id: "GROUP_001",
    score_solo: 62.4,
    score_grupo: 64.1,
    ajuste_holding: 1.7,
    estado: "vigilar",
    direccion: "estable",
    patron_trayectoria: "estable",
    alerta_temprana: false,
    canario_en_mina: false,
    inflexion_detectada: false,
    inflexion_mes: null,
    inflexion_antelacion_meses: 0,
    variable_detonante: null,
    score_pred_3m: null,
    score_pred_grupo_3m: null,
    elegible_credito: true,
    decision_accion: "abrir",
    limite_sugerido_eur: 10000,
    limite_vigente_eur: 8000,
    plazo_max_dias: 90,
    tae_operacion: 0.06,
    gap_ciclo_dias: 40,
    producto_embat: "embat_factoring",
    forecast_metodo_solo: "desconectado",
    forecast_metodo_grupo: "desconectado",
    version_scoring: "scoreSolo-holding-v7",
    version_forecast: null,
    ...overrides,
  };
}

test("serializa nulos y escapa valores CSV sin perder columnas", () => {
  const value = row({ company_id: 'COMP,"quoted"' });
  const csv = submissionCsv([value]);
  assert.match(csv, /company_id,month/);
  assert.match(csv, /"COMP,""quoted"""/);
  assert.match(csv, /"","0"/);

  const json = JSON.parse(submissionJsonl([value])) as SubmissionRow;
  assert.equal(json.score_pred_3m, null);
  assert.equal(json.company_id, 'COMP,"quoted"');
  assert.doesNotThrow(() => submissionRowSchema.parse(json));
});

test("resume corte final e histórico por empresa-mes", () => {
  const rows = [
    row({ month: "2026-07", limite_vigente_eur: 3000 }),
    row({ company_id: "COMP_002", month: "2026-07", estado: "riesgo", elegible_credito: false }),
    row({ month: "2026-08", limite_vigente_eur: 8000 }),
  ];
  const summary = submissionSummary(rows);
  assert.equal(summary.totalRows, 3);
  assert.equal(summary.companies, 2);
  assert.equal(summary.months, 2);
  assert.equal(summary.ultimaObservacion.rows, 2);
  assert.equal(summary.ultimaObservacion.limiteVigenteEur, 16000);
  assert.equal(summary.historico.limiteVigenteEur, 19000);
  assert.equal(summary.historico.estados.riesgo, 1);
  assert.equal(summary.historico.tasaElegible, 2 / 3);
});

test("rechaza scores fuera de [0,100]", () => {
  assert.throws(() => submissionRowSchema.parse(row({ score_solo: 101 })), /score_solo/);
});
