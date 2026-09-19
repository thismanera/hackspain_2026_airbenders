import assert from "node:assert/strict";
import test from "node:test";
import { acumulada, proyectar, tendencia } from "@/lib/features/forecast/trend";

test("forecast trend uses the median of consecutive changes", () => {
  assert.deepEqual(tendencia([100, 100, 100, 100, 100, 140]), {
    tendencia: 0,
    sinTendencia: false,
  });
  assert.deepEqual(tendencia([100, 96, 92, 88, 84, 80]), {
    tendencia: -4,
    sinTendencia: false,
  });
});

test("a missing month breaks a pair and short history is marked", () => {
  assert.deepEqual(tendencia([1, 2, 3, null, 5, 6]), { tendencia: 1, sinTendencia: false });
  assert.deepEqual(tendencia([1, null, 3, null, 5, 6]), { tendencia: 0, sinTendencia: true });
});

test("forecast damping and clips are bounded without moving a constant outside the fit range", () => {
  assert.equal(acumulada(3), 3);
  assert.equal(acumulada(6), 4.5);
  assert.equal(proyectar(10, -4, 3, { p1: 0, p99: 100 }), 0);
  assert.equal(proyectar(10, 0, 6, { p1: 20, p99: 100 }), 10);
  assert.equal(proyectar(10, 1, 6, { p1: null, p99: 12 }), 12);
});
