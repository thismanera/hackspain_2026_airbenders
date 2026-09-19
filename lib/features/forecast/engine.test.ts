import assert from "node:assert/strict";
import test from "node:test";
import {
  flowsConst,
  flowsLineal,
  paramsFixture,
  rowsFromSeries,
} from "@/lib/features/forecast/__fixtures__/series";
import { forecastGroup } from "@/lib/features/forecast/engine";
import type { ForecastGroupInput, MonthlyFlow } from "@/lib/features/forecast/types";
import { FIXTURE_PERCENTILES } from "@/lib/features/scoring/__fixtures__/percentiles";
import type { ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

const PCT = FIXTURE_PERCENTILES;
function input(
  ...cs: { rows: ScoreRow[]; flows: (MonthlyFlow | undefined)[] }[]
): ForecastGroupInput {
  return {
    groupId: "g",
    rows: cs.flatMap((c) => c.rows),
    flows: new Map(cs.map((c) => [c.rows[0].company, c.flows])),
  };
}
const at = (out: ReturnType<typeof forecastGroup>, company: string, m: number) =>
  out.find((f) => f.company === company && f.month === CALENDAR[m])!;

test("fixture estable: score_pred_h == score(t) exactly and drivers have delta 0", () => {
  const c = rowsFromSeries("c", "g", { A1: Array(6).fill(0.15) });
  const f = at(forecastGroup(input(c), paramsFixture(), PCT), "c", 5);
  for (const h of [3, 6] as const) {
    assert.ok(Math.abs(f.horizontes[h].scorePred - c.rows[5].score) < 1e-6, `h=${h}`);
    assert.ok(f.horizontes[h].drivers.every((d) => d.deltaAportacion === 0));
    assert.equal(f.horizontes[h].p10, f.horizontes[h].scorePred);
  }
  assert.equal(f.direccionPred, "estable");
  assert.equal(f.metodo, "v1_proyeccion");
  assert.equal(f.versionParametros, "vf");
});

test("fixture tendencia_bajista: deterioration in 3 months, drivers A4/A3/A1, racha_deficit 0 then 2", () => {
  const c = rowsFromSeries(
    "c",
    "g",
    {
      A1: [0.3, 0.27, 0.24, 0.21, 0.18, 0.15],
      A3: [3, 2.7, 2.4, 2.1, 1.8, 1.5],
      A4: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3],
    },
    { flows: flowsLineal(6, 100_000, 80_000, 65_000) },
  );
  const f = at(forecastGroup(input(c), paramsFixture(), PCT), "c", 5);
  const h3 = f.horizontes[3];
  assert.ok(h3.scorePred < c.rows[5].score - 6, `${h3.scorePred} vs ${c.rows[5].score}`);
  assert.equal(f.direccionPred, "deterioro");
  assert.deepEqual(h3.drivers.map((d) => d.id).sort(), ["A1", "A3", "A4"]);
  assert.ok(h3.drivers.every((d) => d.deltaAportacion < 0));
  assert.equal(h3.rachaDeficitPred, 0);
  assert.equal(f.horizontes[6].rachaDeficitPred, 2);
  assert.ok(f.horizontes[6].scorePred < h3.scorePred);
  assert.ok(Math.abs(h3.cascadaPred.find((x) => x.id === "A1")!.raw! - 0.06) < 1e-9);
});

test("fixture rebote: one extreme month does not set the trend", () => {
  const c = rowsFromSeries(
    "c",
    "g",
    { A1: [0.15, 0.15, 0.15, 0.15, 0.15, 0.25] },
    {
      flows: [
        ...flowsConst(5, 100_000, 85_000),
        { observed: true, cobrosOp: 140_000, pagosOp: 85_000 },
      ],
    },
  );
  const f = at(forecastGroup(input(c), paramsFixture(), PCT), "c", 5);
  assert.ok(Math.abs(f.horizontes[3].scorePred - c.rows[5].score) < 1e-6);
});

test("fixture historial_corto: 3 months means sin_tendencia for every trend variable and score unchanged", () => {
  const c = rowsFromSeries("c", "g", { A1: [0.3, 0.2, 0.1] });
  const f = at(forecastGroup(input(c), paramsFixture(), PCT), "c", 2);
  assert.equal(f.sinTendencia.length, 11);
  assert.ok(Math.abs(f.horizontes[3].scorePred - c.rows[2].score) < 1e-6);
});

test("fixture grupo_arrastre: a sibling's decline lowers the subsidiary's aval and score", () => {
  const hermana = rowsFromSeries(
    "h",
    "g",
    { A1: [0.3, 0.26, 0.22, 0.18, 0.14, 0.1], A3: [3, 2.6, 2.2, 1.8, 1.4, 1] },
    { grupo: () => ({ D1: 0.8, D2: null, D3: null, D5: 0.02, confD: 0 }) },
  );
  const filial = rowsFromSeries(
    "f",
    "g",
    { A1: Array(6).fill(0.02), A3: Array(6).fill(0.8) },
    { grupo: (m) => ({ D1: 0.2, D2: hermana.rows[m].scoreSolo, D3: 3, D5: 0.15, confD: 1 }) },
  );
  const out = forecastGroup(input(filial, hermana), paramsFixture(), PCT);
  const f = at(out, "f", 5);
  const grupo = f.horizontes[3].cascadaPred.find((x) => x.id === "grupo")!;
  assert.ok(grupo.raw! < filial.rows[5].D2!, "D2_pred < D2");
  assert.ok(grupo.aportacion < filial.rows[5].avalGrupo, "aval_pred < aval");
  assert.ok(f.horizontes[3].scorePred < filial.rows[5].score, "score_pred < score");
  assert.equal(f.horizontes[3].drivers[0].id, "grupo");
  // la hermana sin D2 no recibe aval
  assert.equal(
    at(out, "h", 5).horizontes[3].cascadaPred.find((x) => x.id === "grupo")!.aportacion,
    0,
  );
});

test("property 1: score_pred within [0, 100] and p10 <= score_pred <= p90", () => {
  const c = rowsFromSeries("c", "g", {
    A1: [0.3, 0.1, -0.1, -0.3, -0.5, -0.7],
    A2: [0, 0.2, 0.4, 0.6, 0.8, 1],
  });
  const p = paramsFixture();
  for (const h of [3, 6] as const)
    for (const b of ["A", "B", "C", "D"] as const) p.residuos[h][b] = { p10: -8, p90: 6 };
  for (const f of forecastGroup(input(c), p, PCT))
    for (const h of [3, 6] as const) {
      const x = f.horizontes[h];
      assert.ok(x.scorePred >= 0 && x.scorePred <= 100);
      assert.ok(x.p10 <= x.scorePred && x.scorePred <= x.p90);
    }
});

test("property 3 (no leak): the forecast at t is identical when the input is truncated at t", () => {
  const c = rowsFromSeries(
    "c",
    "g",
    { A1: Array.from({ length: 12 }, (_, i) => 0.3 - 0.02 * i) },
    { flows: flowsLineal(12, 120_000, 80_000, 70_000) },
  );
  const full = at(forecastGroup(input(c), paramsFixture(), PCT), "c", 7);
  const cut = { rows: c.rows.slice(0, 8), flows: c.flows.slice(0, 8) };
  const truncated = at(forecastGroup(input(cut), paramsFixture(), PCT), "c", 7);
  assert.deepEqual(truncated, full);
});

test("property 4: same input means same output; and a P_det table feeds probDeterioro6m", () => {
  const c = rowsFromSeries("c", "g", { A1: [0.3, 0.27, 0.24, 0.21, 0.18, 0.15] });
  const p = paramsFixture();
  p.pDet.A.A = 0.05;
  const a = forecastGroup(input(c), p, PCT);
  const b = forecastGroup(input(c), p, PCT);
  assert.deepEqual(a, b);
  assert.equal(a.length, 6);
  assert.equal(at(a, "c", 5).probDeterioro6m, 0.05);
});

test("desconectado parameters mark every row as desconectado", () => {
  const c = rowsFromSeries("c", "g", { A1: [0.15, 0.15] });
  const out = forecastGroup(input(c), paramsFixture({ conectado: false }), PCT);
  assert.ok(out.every((f) => f.metodo === "desconectado"));
});

test("rows from another group are rejected", () => {
  const c = rowsFromSeries("c", "otro", { A1: [0.15] });
  assert.throws(() => forecastGroup(input(c), paramsFixture(), PCT), /grupo/);
});
