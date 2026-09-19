import assert from "node:assert/strict";
import test from "node:test";
import {
  flowsLineal,
  paramsFixture,
  rowsFromSeries,
  type SeriesFixture,
} from "@/lib/features/forecast/__fixtures__/series";
import { type CompanyCtx, proyectarEmpresa } from "@/lib/features/forecast/project";

function ctx(r: SeriesFixture, t: number): CompanyCtx {
  return { rows: r.rows, flows: r.flows, t };
}

test("stable series: every projected raw equals the current one and rachas do not move", () => {
  const r = rowsFromSeries("c", "g", { A1: [0.15, 0.15, 0.15, 0.15, 0.15, 0.15] });
  const p = proyectarEmpresa(ctx(r, 5), 3, paramsFixture().clip);
  for (const c of r.rows[5].variables.filter((c) => c.id !== "grupo"))
    assert.equal(p.vars[c.id as keyof typeof p.vars].raw, c.raw, c.id);
  assert.equal(p.rachaDeficitPred, 0);
  assert.equal(p.rachaB2Pred, 0);
  assert.deepEqual(p.rachaB2Prev, [0, 0, 0]);
});

test("downward trend projects A1 with damping and recomputes A2 and racha_deficit from cash", () => {
  // cobros 100 k → 80 k (−4 k/mes), pagos 65 k: caja(t) = 15 k; acumulada −4·[1,2,3,3.5,4,4.5]
  const r = rowsFromSeries(
    "c",
    "g",
    { A1: [0.3, 0.27, 0.24, 0.21, 0.18, 0.15] },
    { flows: flowsLineal(6, 100_000, 80_000, 65_000) },
  );
  const p3 = proyectarEmpresa(ctx(r, 5), 3, paramsFixture().clip);
  const p6 = proyectarEmpresa(ctx(r, 5), 6, paramsFixture().clip);
  assert.ok(Math.abs(p3.vars.A1.raw! - 0.06) < 1e-9);
  assert.ok(Math.abs(p6.vars.A1.raw! - 0.015) < 1e-9);
  assert.equal(p3.rachaDeficitPred, 0); // t+1..t+3: 11, 7, 3 k
  assert.equal(p6.rachaDeficitPred, 2); // t+4: 1 k, t+5: −1 k, t+6: −3 k
  assert.equal(p3.vars.A2.raw, 0);
  assert.ok(Math.abs(p6.vars.A2.raw! - 2 / 6) < 1e-9);
  assert.equal(p3.vars.C5.raw, 0.2); // constante
  assert.equal(p3.vars.A1.conf, 1); // conf constante
});

test("short history flags every trend variable as sinTendencia and keeps raws", () => {
  const r = rowsFromSeries("c", "g", { A1: [0.3, 0.2, 0.1] });
  const p = proyectarEmpresa(ctx(r, 2), 3, paramsFixture().clip);
  assert.equal(p.vars.A1.raw, 0.1);
  assert.equal(p.sinTendencia.length, 11);
  assert.ok(p.sinTendencia.includes("A1"));
  assert.ok(!p.sinTendencia.includes("A2"));
});

test("NA in t stays NA; B2 rises one month only if projected B1 drops below the threshold", () => {
  const r = rowsFromSeries("c", "g", {
    A3: [null, null, null, null, null, null],
    B1: [1, 0.98, 0.96, 0.94, 0.92, 0.9],
  });
  const p = proyectarEmpresa(ctx(r, 5), 3, paramsFixture().clip);
  assert.equal(p.vars.A3.raw, null);
  assert.ok(p.vars.B1.raw! < 0.9);
  assert.equal(p.rachaB2Pred, 1);
  assert.equal(p.vars.B2.raw, 1);
  assert.deepEqual(p.rachaB2Prev, [1, 1, 0]); // t+2, t+1 proyectados; t real = 0
});

test("clip bounds the projection to the fitted range", () => {
  const r = rowsFromSeries("c", "g", { A4: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3] });
  const clip = paramsFixture().clip;
  clip.A4 = { p1: 0, p99: 0.35 };
  const p = proyectarEmpresa(ctx(r, 5), 6, clip);
  assert.equal(p.vars.A4.raw, 0.35); // 0,3 + 0,05 · 4,5 = 0,525 → clip
});
