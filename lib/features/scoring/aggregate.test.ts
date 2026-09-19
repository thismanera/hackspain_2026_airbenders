import assert from "node:assert/strict";
import test from "node:test";
import { FIXTURE_PERCENTILES } from "@/lib/features/scoring/__fixtures__/percentiles";
import {
  aggregate,
  estadoConGrupo,
  estadoSolo,
  subnota,
  subnotaB2,
} from "@/lib/features/scoring/aggregate";
import { PARAMS } from "@/lib/features/scoring/params";
import type { Percentiles, VariableSet } from "@/lib/features/scoring/types";

test("subnota scales between p5 and p95 and inverts for 'bajo'", () => {
  assert.ok(Math.abs(subnota("A1", 0.15, FIXTURE_PERCENTILES) - 62.5) < 1e-9);
  assert.ok(Math.abs(subnota("A3", 3, FIXTURE_PERCENTILES) - 71.428571) < 1e-5);
  assert.ok(Math.abs(subnota("A4", 0.05, FIXTURE_PERCENTILES) - 90) < 1e-9);
  assert.equal(subnota("A1", 5, FIXTURE_PERCENTILES), 100);
  assert.equal(subnota("A1", null, FIXTURE_PERCENTILES), 50);
});

test("subnota is neutral when the variable has no fitted percentiles", () => {
  const sinAjuste: Percentiles = { ...FIXTURE_PERCENTILES, A1: { p5: null, p95: null } };
  assert.equal(subnota("A1", 0.15, sinAjuste), 50);
  assert.equal(subnota("A1", 0.15, { ...FIXTURE_PERCENTILES, A1: { p5: 0.1, p95: null } }), 50);
});

test("B2 rule with decay", () => {
  assert.equal(subnotaB2(2, [0, 0, 0]), 0);
  assert.equal(subnotaB2(1, [0, 0, 0]), 70);
  assert.equal(subnotaB2(0, [1, 0, 0]), 80);
  assert.equal(subnotaB2(0, [0, 1, 0]), 90);
  assert.equal(subnotaB2(0, [0, 0, 1]), 100);
  assert.equal(subnotaB2(0, [0, 0, 0]), 100);
  assert.equal(subnotaB2(0), 100);
  assert.ok(Math.abs(subnotaB2(0, [2, 0, 0]) - 100 / 3) < 1e-9);
});

test("aggregate: weighted blocks make up score_solo, NA pulls to 50", () => {
  const vars = {
    A1: { raw: 0.15, conf: 1 },
    A2: { raw: 0, conf: 1 },
    A3: { raw: 3, conf: 1 },
    A4: { raw: 0.05, conf: 1 },
    A5: { raw: null, conf: 0.3 },
    B1: { raw: 1, conf: 1 },
    B2: { raw: 0, conf: 1 },
    B3: { raw: null, conf: 0 },
    C1: { raw: 0.3, conf: 1 },
    C2: { raw: null, conf: 0 },
    C3: { raw: null, conf: 0 },
    C4: { raw: null, conf: 0 },
    C5: { raw: 0, conf: 1 },
    C6: { raw: 0, conf: 1 },
  } as VariableSet;
  const r = aggregate(vars, { rachaB2Prev: [0, 0, 0] }, FIXTURE_PERCENTILES);
  const sumA = r.contributions
    .filter((c) => c.id.startsWith("A"))
    .reduce((a, c) => a + c.aportacion, 0);
  const expectedA =
    (0.1 * 62.5 + 0.1 * 100 + 0.1 * 71.42857142857143 + 0.08 * 90 + 0.07 * 50) / 0.45;
  assert.ok(Math.abs(r.subscores.A - expectedA) < 1e-4);
  assert.ok(Math.abs(sumA - 0.45 * r.subscores.A) < 1e-9);
  const esperado =
    PARAMS.pesos.A * r.subscores.A +
    PARAMS.pesos.B * r.subscores.B +
    PARAMS.pesos.C * r.subscores.C;
  assert.ok(Math.abs(r.scoreSolo - esperado) < 1e-9);
  assert.ok(Math.abs(r.confs.A - (0.1 + 0.1 + 0.1 + 0.08 + 0.07 * 0.3) / 0.45) < 1e-9);
  const a1 = r.contributions.find((c) => c.id === "A1")!;
  assert.equal(a1.umbralSano, 0.1);
  assert.equal(a1.sano, true);
});

test("aggregate reads the B2 streak from its raw value", () => {
  const base = Object.fromEntries(
    [...PARAMS.bloques.A, ...PARAMS.bloques.B, ...PARAMS.bloques.C].map((id) => [
      id,
      { raw: null, conf: 0 },
    ]),
  ) as VariableSet;
  const b2 = (raw: number | null, prev: number[]) =>
    aggregate(
      { ...base, B2: { raw, conf: 1 } },
      { rachaB2Prev: prev },
      FIXTURE_PERCENTILES,
    ).contributions.find((c) => c.id === "B2")!.subnota;
  assert.equal(b2(2, [0, 0, 0]), 0);
  assert.equal(b2(1, [0, 0, 0]), 70);
  assert.equal(b2(0, [1, 0, 0]), 80);
  assert.equal(b2(null, [0, 0, 0]), 50);
});

test("estado thresholds", () => {
  const vars = Object.fromEntries(
    [...PARAMS.bloques.A, ...PARAMS.bloques.B, ...PARAMS.bloques.C].map((id) => [
      id,
      { raw: 1, conf: 1 },
    ]),
  ) as VariableSet;
  vars.A1 = { raw: 0.2, conf: 1 };
  vars.B2 = { raw: 0, conf: 1 };
  vars.C4 = { raw: 0.1, conf: 1 };
  assert.equal(estadoSolo(80, 0.9, 0, vars), "sana");
  assert.equal(estadoSolo(80, 0.4, 0, vars), "vigilar");
  assert.equal(estadoSolo(60, 0.9, 0, vars), "vigilar");
  assert.equal(estadoSolo(40, 0.9, 0, vars), "riesgo");
  assert.equal(estadoSolo(80, 0.9, 2, vars), "riesgo");
  assert.equal(estadoSolo(80, 0.2, 0, vars), "sin_datos");
});

test("healthy state accepts absent invoice and obligation observations", () => {
  const vars = Object.fromEntries(
    [...PARAMS.bloques.A, ...PARAMS.bloques.B, ...PARAMS.bloques.C].map((id) => [
      id,
      { raw: 1, conf: 1 },
    ]),
  ) as VariableSet;
  vars.A1 = { raw: 0.2, conf: 1 };
  vars.B2 = { raw: null, conf: 0 };
  vars.C4 = { raw: null, conf: 0 };
  assert.equal(estadoSolo(80, 0.9, 0, vars), "sana");
  assert.equal(estadoConGrupo("vigilar", 80, 0.9, "estandar", 0, 0, vars), "sana");
});

test("loan without a credit line reallocates A and excludes A5", () => {
  const vars = Object.fromEntries(
    [...PARAMS.bloques.A, ...PARAMS.bloques.B, ...PARAMS.bloques.C].map((id) => [
      id,
      { raw: 0, conf: 1 },
    ]),
  ) as VariableSet;
  const result = aggregate(vars, { rachaB2Prev: [0, 0, 0] }, FIXTURE_PERCENTILES, {
    tieneCuotas: true,
    tieneLineaCredito: false,
  });
  const a = result.contributions.filter((contribution) => contribution.id.startsWith("A"));
  assert.deepEqual(
    a.map((contribution) => contribution.peso),
    [0.12, 0.12, 0.11, 0.1, 0],
  );
  assert.equal(a[4].aplicable, false);
  assert.ok(
    Math.abs(a.reduce((total, contribution) => total + contribution.peso, 0) - 0.45) < 1e-12,
  );
});
