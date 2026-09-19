import assert from "node:assert/strict";
import test from "node:test";
import { rowsFromSeries } from "@/lib/features/forecast/__fixtures__/series";
import { cascada, d2Pred, drivers, recomponer, scorePred } from "@/lib/features/forecast/recompose";
import { FIXTURE_PERCENTILES } from "@/lib/features/scoring/__fixtures__/percentiles";
import type { VariableSet } from "@/lib/features/scoring/types";

function varsOf(r: ReturnType<typeof rowsFromSeries>, m: number): VariableSet {
  return Object.fromEntries(
    r.rows[m].variables
      .filter((c) => c.id !== "grupo")
      .map((c) => [c.id, { raw: c.raw, conf: c.conf }]),
  ) as VariableSet;
}

test("recomponer with the current variables reproduces scoreSolo exactly", () => {
  const r = rowsFromSeries("c", "g", { A1: [0.15] });
  const agg = recomponer(varsOf(r, 0), [0, 0, 0], FIXTURE_PERCENTILES);
  assert.ok(Math.abs(agg.scoreSolo - r.rows[0].scoreSolo) < 1e-9);
});

test("d2Pred moves D2 by the D1-weighted delta of the siblings' scoreSolo", () => {
  const me = rowsFromSeries(
    "f",
    "g",
    { A1: [0.15] },
    { grupo: () => ({ D1: 0.2, D2: 80, D3: 3, D5: 0.15, confD: 1 }) },
  ).rows[0];
  const h1 = rowsFromSeries(
    "h1",
    "g",
    { A1: [0.15] },
    { grupo: () => ({ D1: 0.6, D2: null, D3: null, D5: 0, confD: 0 }) },
  ).rows[0];
  const h2 = rowsFromSeries(
    "h2",
    "g",
    { A1: [0.15] },
    { grupo: () => ({ D1: 0.2, D2: null, D3: null, D5: 0, confD: 0 }) },
  ).rows[0];
  const d2 = d2Pred(me, [
    { row: h1, scoreSoloPred: h1.scoreSolo - 10 },
    { row: h2, scoreSoloPred: h2.scoreSolo + 4 },
  ]);
  // (0,6·(−10) + 0,2·4) / 0,8 = −6,5
  assert.ok(Math.abs(d2! - 73.5) < 1e-9);
  assert.equal(d2Pred({ ...me, D2: null }, []), null);
  assert.equal(d2Pred(me, []), 80);
  // Ninguna hermana tiene cobros (D1 = 0): media simple (−10 + 4) / 2 = −3.
  const simple = d2Pred(me, [
    { row: { ...h1, D1: 0 }, scoreSoloPred: h1.scoreSolo - 10 },
    { row: { ...h2, D1: 0 }, scoreSoloPred: h2.scoreSolo + 4 },
  ]);
  assert.ok(Math.abs(simple! - 77) < 1e-9);
});

test("d2Pred clamps the projected D2 to the score range", () => {
  const me = rowsFromSeries(
    "f",
    "g",
    { A1: [0.15] },
    { grupo: () => ({ D1: 0.2, D2: 98, D3: 3, D5: 0.15, confD: 1 }) },
  ).rows[0];
  const h1 = rowsFromSeries(
    "h1",
    "g",
    { A1: [0.15] },
    { grupo: () => ({ D1: 0.6, D2: null, D3: null, D5: 0, confD: 0 }) },
  ).rows[0];
  // 98 + 12 = 110 sin recortar: `forecastRowSchema` rechazaría la subnota de `grupo`.
  assert.equal(d2Pred(me, [{ row: h1, scoreSoloPred: h1.scoreSolo + 12 }]), 100);
});

test("scorePred = clamp(scoreSolo + aval(D2pred)) and cascada sums to it", () => {
  const me = rowsFromSeries(
    "f",
    "g",
    { A1: [0.15] },
    { grupo: () => ({ D1: 0.2, D2: 95, D3: 3, D5: 0.15, confD: 1 }) },
  ).rows[0];
  const agg = recomponer(varsOf({ rows: [me], flows: [] }, 0), [0, 0, 0], FIXTURE_PERCENTILES);
  const s = scorePred(agg.scoreSolo, me, 95);
  assert.ok(Math.abs(s - me.score) < 1e-9);
  const c = cascada(agg, me, 95, s);
  assert.equal(c.length, 15);
  assert.ok(Math.abs(c.reduce((a, x) => a + x.aportacion, 0) - s) < 1e-9);
  assert.equal(c.at(-1)!.id, "grupo");
});

test("drivers are the 3 largest |delta aportacion| with current and projected raw", () => {
  const r = rowsFromSeries("c", "g", { A1: [0.15, 0.05], A4: [0.05, 0.4], C1: [0.3, 0.35] });
  const d = drivers(r.rows[0].variables, r.rows[1].variables);
  assert.equal(d.length, 3);
  assert.deepEqual(
    d.map((x) => x.id),
    ["A4", "A1", "C1"],
  );
  assert.equal(d[0].valorActual, 0.05);
  assert.equal(d[0].valorPred, 0.4);
  assert.ok(d[0].deltaAportacion < 0);
});
