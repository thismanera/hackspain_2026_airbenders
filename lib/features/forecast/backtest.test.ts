import assert from "node:assert/strict";
import test from "node:test";

import {
  decisionFixture,
  paramsFixture,
  rowsFromSeries,
} from "@/lib/features/forecast/__fixtures__/series";
import { backtestForecast } from "@/lib/features/forecast/backtest";
import { forecastGroup } from "@/lib/features/forecast/engine";
import { FIXTURE_PERCENTILES } from "@/lib/features/scoring/__fixtures__/percentiles";
import { CALENDAR } from "@/lib/features/scoring/windows";

const n = 12;
const c = rowsFromSeries("c", "g", { A1: Array.from({ length: n }, (_, i) => 0.3 - 0.02 * i) });
const forecasts = forecastGroup(
  { groupId: "g", rows: c.rows, flows: new Map([["c", c.flows]]) },
  paramsFixture(),
  FIXTURE_PERCENTILES,
);
const ventanas = {
  3: [CALENDAR[0], CALENDAR[8]] as [string, string],
  6: [CALENDAR[0], CALENDAR[5]] as [string, string],
};

test("MAE, band accuracy and coverage per horizon against the naive baseline", () => {
  const r = backtestForecast(c.rows, forecasts, [], [], ventanas);
  assert.equal(r.horizontes[3].filas, 9);
  assert.equal(r.horizontes[6].filas, 6);
  assert.ok(r.horizontes[3].mae! < r.horizontes[3].maeBaseline!);
  assert.ok(r.horizontes[3].aciertoBanda! >= r.horizontes[3].aciertoBandaBaseline!);
  // residuos ±0 ⇒ el intervalo es un punto: cobertura solo si acierta exacto
  assert.ok(r.horizontes[3].coberturaIntervalo! >= 0 && r.horizontes[3].coberturaIntervalo! <= 1);
});

test("preventive reductions are those present with forecast and absent without, false if no event follows", () => {
  const con = [
    decisionFixture({ month: CALENDAR[2], accion: "reducir" }),
    decisionFixture({ month: CALENDAR[3], accion: "reducir" }),
    decisionFixture({ month: CALENDAR[4], accion: "mantener" }),
  ];
  const sin = [
    decisionFixture({ month: CALENDAR[2], accion: "mantener" }),
    decisionFixture({ month: CALENDAR[3], accion: "reducir" }),
    decisionFixture({ month: CALENDAR[4], accion: "mantener" }),
  ];
  const r = backtestForecast(c.rows, forecasts, con, sin, ventanas);
  assert.equal(r.reduccionesPreventivas, 1);
  assert.equal(r.falsasReduccionesPreventivas, 1); // el fixture no tiene déficits ⇒ sin evento
  assert.equal(r.ratioFalsasPreventivas, 1);
  assert.equal(r.leadTime.conPrevision, null);
});
