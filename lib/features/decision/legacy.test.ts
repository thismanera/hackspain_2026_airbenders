import assert from "node:assert/strict";
import test from "node:test";
import { decisionRowSchema } from "@/lib/features/decision/contracts";
import { decideLegacy } from "@/lib/features/decision/legacy";
import type { ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

function row(month: string, p: Partial<ScoreRow>): ScoreRow {
  return {
    company: "c", month, groupId: "g", versionParametros: "v", score: 80, scoreSolo: 80, avalGrupo: 0, confianza: 0.9,
    subscores: { A: 80, B: 80, C: 80 }, confs: { A: 1, B: 1, C: 1 }, estado: "sana", variables: [], deltaContrib: [],
    direccion: "estable", naturaleza: "sin_cambio", tendScore3m: null, tend3m: { A: null, B: null, C: null },
    rachaB2: 0, rachaDeficit: 0, C3dias: null, C4: null,
    cobrosOpMedia3m: 100_000, cobrosOpMedia6m: 100_000, pagosOpMedia6m: 60_000, servicioDeudaMedia6m: 5_000,
    amortCreditoMedia6m: 0, obligacionesRecMedia6m: 0, capacidadCuotaAdv: 0,
    D1: 1, D2: null, D3: null, D4: null, D5: 0, confD: 0, tienePrestamoIntragrupo: false,
    cobrosOpGrupoMedia6m: 0, pagosOpGrupoMedia6m: 0, servicioDeudaGrupoMedia6m: 0, scoreGrupo: null,
    deficitMes: false, margenMes: 0.15,
    senales: { deterioro: false, estructural: false, mejora: false, deficit: false, impago: false, vencidoAlto: false, contagio: false, datosInsuficientes: false },
    alertas: [],
    cobertura: { mesesObs6m: 6, mesesObs12m: 6, pctClasificado6m: 1, nFacturasCli6m: 0, nFacturasProv6m: 0, tieneLineaCredito: false, tieneCuotas: true, C4Estimado: true, nHermanasConDatos: 0 },
    ...p,
  };
}

test("legacy decision reproduces band A limit and opens on first month", () => {
  const rows = [row(CALENDAR[0], {}), row(CALENDAR[1], {})];
  const d = decideLegacy(rows);
  assert.equal(d.length, 2);
  for (const x of d) decisionRowSchema.parse(x);
  assert.equal(d[0].banda, "A");
  assert.equal(d[0].accion, "abrir");
  const adverse = Math.max(0, (0.8 * 100_000 - 1.1 * 60_000) / 1.3 - 5_000);
  const expected = Math.round((Math.min(adverse * 12, 0.8 * 300_000) * 1 * 1) / 1000) * 1000;
  assert.equal(d[0].limiteRecomendado, expected);
  assert.equal(d[0].limiteVigente, expected);
  assert.equal(d[1].accion, "mantener");
  assert.equal(d[0].precio, 0.05);
});

test("hard close on band D, three deficits or overdue > 40 %", () => {
  assert.equal(decideLegacy([row(CALENDAR[0], { score: 40 })])[0].accion, "cerrar");
  assert.equal(decideLegacy([row(CALENDAR[0], { rachaDeficit: 3 })])[0].accion, "cerrar");
  assert.equal(decideLegacy([row(CALENDAR[0], { C4: 0.5 })])[0].accion, "cerrar");
  assert.equal(decideLegacy([row(CALENDAR[0], { confianza: 0.2 })])[0].accion, "mantener");
});
