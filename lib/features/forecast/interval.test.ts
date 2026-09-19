import assert from "node:assert/strict";
import test from "node:test";
import { paramsFixture } from "@/lib/features/forecast/__fixtures__/series";
import { direccionPred, intervalo, probDeterioro } from "@/lib/features/forecast/interval";
import type { Residuos } from "@/lib/features/forecast/params";

test("intervalo adds the frozen residual percentiles and clamps to [0, 100]", () => {
  const p = paramsFixture();
  p.residuos[3].B = { p10: -12, p90: 5 };
  assert.deepEqual(intervalo(60, 3, "B", p.residuos), { p10: 48, p90: 65 });
  assert.deepEqual(intervalo(98, 3, "B", p.residuos), { p10: 86, p90: 100 });
  assert.deepEqual(intervalo(50, 6, "A", p.residuos), { p10: 50, p90: 50 });
  // Tabla sin la celda: el intervalo colapsa al score previsto.
  assert.deepEqual(intervalo(60, 3, "C", { 3: {}, 6: {} } as Residuos), { p10: 60, p90: 60 });
});

test("direccionPred uses the ±6 threshold against the current score", () => {
  assert.equal(direccionPred(54, 60), "deterioro");
  assert.equal(direccionPred(55, 60), "estable");
  assert.equal(direccionPred(66, 60), "mejora");
});

test("probDeterioro reads the P_det cell", () => {
  const p = paramsFixture();
  p.pDet.B.C = 0.4;
  assert.equal(probDeterioro("B", "C", p.pDet), 0.4);
  assert.equal(probDeterioro("A", "A", p.pDet), null);
});
