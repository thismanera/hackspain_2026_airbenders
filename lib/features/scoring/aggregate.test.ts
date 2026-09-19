import assert from "node:assert/strict";
import test from "node:test";
import { aggregate, estado, subnota, subnotaB2 } from "@/lib/features/scoring/aggregate";
import { FIXTURE_PERCENTILES } from "@/lib/features/scoring/fixtures";
import type { VariableSet } from "@/lib/features/scoring/types";

test("subnota scales between p5 and p95 and inverts for 'bajo'", () => {
  assert.ok(Math.abs(subnota("A1", 0.15, FIXTURE_PERCENTILES) - 62.5) < 1e-9);
  assert.ok(Math.abs(subnota("A3", 3, FIXTURE_PERCENTILES) - 71.428571) < 1e-5);
  assert.ok(Math.abs(subnota("A4", 0.05, FIXTURE_PERCENTILES) - 90) < 1e-9);
  assert.equal(subnota("A1", 5, FIXTURE_PERCENTILES), 100);
  assert.equal(subnota("A1", null, FIXTURE_PERCENTILES), 50);
});

test("B2 rule with decay", () => {
  assert.equal(subnotaB2(2, [0, 0, 0]), 0);
  assert.equal(subnotaB2(1, [0, 0, 0]), 70);
  assert.equal(subnotaB2(0, [1, 0, 0]), 80);
  assert.equal(subnotaB2(0, [0, 1, 0]), 90);
  assert.equal(subnotaB2(0, [0, 0, 1]), 100);
  assert.equal(subnotaB2(0, [0, 0, 0]), 100);
  assert.ok(Math.abs(subnotaB2(0, [2, 0, 0]) - 100 / 3) < 1e-9);
});

test("aggregate: contributions sum to score_solo, NA pulls to 50", () => {
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
  const r = aggregate(vars, { rachaB2: 0, rachaB2Prev: [0, 0, 0] }, FIXTURE_PERCENTILES);
  const sumA = r.contributions
    .filter((c) => c.id.startsWith("A"))
    .reduce((a, c) => a + c.aportacion, 0);
  assert.ok(Math.abs(r.subscores.A - (62.5 + 100 + 71.428571 + 90 + 50) / 5) < 1e-4);
  assert.ok(Math.abs(sumA - 0.45 * r.subscores.A) < 1e-9);
  assert.ok(Math.abs(r.contributions.reduce((a, c) => a + c.aportacion, 0) - r.scoreSolo) < 1e-9);
  assert.ok(Math.abs(r.confs.A - (1 + 1 + 1 + 1 + 0.3) / 5) < 1e-9);
  const a1 = r.contributions.find((c) => c.id === "A1")!;
  assert.equal(a1.umbralSano, 0.1);
  assert.equal(a1.sano, true);
});

test("estado thresholds", () => {
  assert.equal(estado(80, 0.9, 0), "sana");
  assert.equal(estado(80, 0.4, 0), "vigilar");
  assert.equal(estado(60, 0.9, 0), "vigilar");
  assert.equal(estado(40, 0.9, 0), "riesgo");
  assert.equal(estado(80, 0.9, 2), "riesgo");
  assert.equal(estado(80, 0.2, 0), "sin_datos");
});
