import assert from "node:assert/strict";
import test from "node:test";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";
import { backtest } from "@/lib/features/scoring/backtest";
import type { Alert, ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

function series(
  company: string,
  deficit: boolean[],
  alertas: Record<number, Alert[]> = {},
  offset = 0,
): ScoreRow[] {
  return deficit.map((d, i) =>
    scoreRowFixture({
      company,
      month: CALENDAR[offset + i],
      scoreSolo: 60,
      deficitMes: d,
      margenMes: d ? -0.1 : 0.1,
      alertas: alertas[i] ?? [],
    }),
  );
}

const D = [
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  true,
  true,
  true,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
];

test("deterioration event detected and lead time measured from desdeMes", () => {
  const alerta = (mes: string): Alert[] => [{ tipo: "deterioro", desdeMes: mes }];
  const rows = series("c", D, { 6: alerta(CALENDAR[5]), 7: alerta(CALENDAR[5]) });
  const r = backtest(rows);
  assert.equal(r.deterioro.events, 1);
  assert.equal(r.deterioro.matched, 1);
  assert.equal(r.deterioro.recall, 1);
  assert.equal(r.deterioro.leadMedian, 3); // evento en 2025-05, desde_mes 2025-02
  assert.equal(r.deterioro.leadP25, 3);
  assert.equal(r.deterioro.falseAlarmRate, 0);
  assert.equal(r.censoredMonths, 6);
});

test("lead time is a calendar distance, not a list offset", () => {
  const alerta = (mes: string): Alert[] => [{ tipo: "deterioro", desdeMes: mes }];
  const rows = series("c", D, { 6: alerta(CALENDAR[8]), 7: alerta(CALENDAR[8]) }, 3);
  const r = backtest(rows);
  assert.equal(r.deterioro.events, 1);
  assert.equal(r.deterioro.leadMedian, 3);
});

test("recovery is measured symmetrically", () => {
  const deficit = [true, true, true, ...Array<boolean>(9).fill(false)];
  const rows = series("c", deficit, { 1: [{ tipo: "recuperacion", desdeMes: CALENDAR[1] }] });
  const r = backtest(rows);
  assert.equal(r.recuperacion.events, 1);
  assert.equal(r.recuperacion.matched, 1);
  assert.equal(r.recuperacion.leadMedian, 2);
  assert.equal(r.recuperacion.falseAlarmRate, 0);
  assert.equal(r.deterioro.events, 0);
  assert.equal(r.deterioro.recall, null);
});

test("an alert without an event within six months is a false alarm", () => {
  const rows = series("c", Array<boolean>(12).fill(false), {
    2: [{ tipo: "deterioro", desdeMes: CALENDAR[2] }],
    3: [{ tipo: "deterioro", desdeMes: CALENDAR[2] }], // sigue activa: no es una emisión nueva
  });
  const r = backtest(rows);
  assert.equal(r.deterioro.events, 0);
  assert.equal(r.deterioro.alerts, 1);
  assert.equal(r.deterioro.falseAlarmRate, 1);
  assert.equal(r.deterioro.leadMedian, null);
});

test("companies are scored independently and pooled", () => {
  const alerta = (mes: string): Alert[] => [{ tipo: "deterioro", desdeMes: mes }];
  const rows = [
    ...series("c1", D, { 6: alerta(CALENDAR[5]) }),
    ...series("c2", D, {}), // mismo evento, sin alerta previa
  ];
  const r = backtest(rows);
  assert.equal(r.deterioro.events, 2);
  assert.equal(r.deterioro.matched, 1);
  assert.equal(r.deterioro.recall, 0.5);
  assert.equal(r.forwardMarginPairs, 2 * (D.length - 3));
});

test("the month window restricts events and pairs, not alert eligibility", () => {
  const alerta = (mes: string): Alert[] => [{ tipo: "deterioro", desdeMes: mes }];
  const rows = series("c", D, { 6: alerta(CALENDAR[5]), 7: alerta(CALENDAR[5]) });
  const dentro = backtest(rows, { months: [CALENDAR[0], CALENDAR[17]] });
  assert.equal(dentro.deterioro.events, 1);
  assert.equal(dentro.deterioro.alerts, 1);
  const fuera = backtest(rows, { months: [CALENDAR[10], CALENDAR[17]] });
  assert.equal(fuera.deterioro.events, 0); // el evento de CALENDAR[8] queda fuera
  assert.equal(fuera.deterioro.recall, null);
  // La alerta se emite en CALENDAR[6] y su seguimiento (hasta CALENDAR[12]) solapa la ventana:
  // sigue siendo elegible, y el evento de CALENDAR[8] la redime aunque no se cuente como evento.
  assert.equal(fuera.deterioro.alerts, 1);
  assert.equal(fuera.deterioro.falseAlarmRate, 0);
  assert.ok(fuera.forwardMarginPairs < dentro.forwardMarginPairs);
});

test("an alert emitted before the window counts if its event falls inside", () => {
  const alerta = (mes: string): Alert[] => [{ tipo: "deterioro", desdeMes: mes }];
  const rows = series("c", D, { 6: alerta(CALENDAR[5]), 7: alerta(CALENDAR[5]) });
  const r = backtest(rows, { months: [CALENDAR[8], CALENDAR[17]] }); // emisión 2 meses antes
  assert.equal(r.deterioro.events, 1); // evento en CALENDAR[8], primer mes de la ventana
  assert.equal(r.deterioro.alerts, 1);
  assert.equal(r.deterioro.matched, 1);
  assert.equal(r.deterioro.falseAlarmRate, 0);
  assert.equal(r.deterioro.leadMedian, 3);
});

test("an alert emitted before the window with no event is a false alarm", () => {
  const rows = series("c", Array<boolean>(12).fill(false), {
    2: [{ tipo: "deterioro", desdeMes: CALENDAR[2] }],
  });
  const r = backtest(rows, { months: [CALENDAR[8], CALENDAR[11]] });
  assert.equal(r.deterioro.events, 0);
  assert.equal(r.deterioro.alerts, 1); // CALENDAR[2] + 6 == CALENDAR[8]: solapa la ventana
  assert.equal(r.deterioro.falseAlarmRate, 1);
});

test("an alert whose follow-up ends before the window is not eligible", () => {
  const rows = series("c", Array<boolean>(12).fill(false), {
    1: [{ tipo: "deterioro", desdeMes: CALENDAR[1] }],
  });
  const r = backtest(rows, { months: [CALENDAR[8], CALENDAR[11]] });
  assert.equal(r.deterioro.alerts, 0); // CALENDAR[1] + 6 < CALENDAR[8]
  assert.equal(r.deterioro.falseAlarmRate, null);
});

test("an alert emitted in the last six months of the series is censored", () => {
  const rows = series("c", Array<boolean>(12).fill(false), {
    7: [{ tipo: "deterioro", desdeMes: CALENDAR[7] }],
  });
  const r = backtest(rows);
  assert.equal(r.deterioro.alerts, 0); // CALENDAR[7] + 6 > CALENDAR[11], último de la serie
  assert.equal(r.deterioro.falseAlarmRate, null);
});
