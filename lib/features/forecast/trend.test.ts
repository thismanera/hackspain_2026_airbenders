import assert from "node:assert/strict";
import test from "node:test";
import { acumulada, proyectar, tendencia } from "@/lib/features/forecast/trend";

test("tendencia is the median of consecutive deltas, robust to one extreme month", () => {
  // 5 meses constantes y rebote +40: deltas [0,0,0,0,40] → mediana 0
  assert.deepEqual(tendencia([100, 100, 100, 100, 100, 140]), { tendencia: 0, sinTendencia: false });
  assert.deepEqual(tendencia([100, 96, 92, 88, 84, 80]), { tendencia: -4, sinTendencia: false });
});

test("fewer than minMesesTendencia observations means no trend", () => {
  assert.deepEqual(tendencia([1, 2, 3]), { tendencia: 0, sinTendencia: true });
  assert.deepEqual(tendencia([1, 2, 3, 4]), { tendencia: 1, sinTendencia: false });
});

test("a gap breaks the delta pair but not the rest of the series", () => {
  // pares válidos: (1,2) (2,3) ... null rompe (3,null) y (null,5): 3 deltas [1,1,1] → mediana 1
  assert.deepEqual(tendencia([1, 2, 3, null, 5, 6]), { tendencia: 1, sinTendencia: false });
  assert.deepEqual(tendencia([1, 2, 3, 4, null, 6]), { tendencia: 1, sinTendencia: false });
  // Solo (5,6) sobrevive: 1 delta < minMesesTendencia − 1 ⇒ sin tendencia
  assert.deepEqual(tendencia([1, null, 3, null, 5, 6]), { tendencia: 0, sinTendencia: true });
});

test("acumulada applies full trend 3 months and half the next 3", () => {
  assert.equal(acumulada(3), 3);
  assert.equal(acumulada(6), 4.5);
  assert.equal(acumulada(0), 0);
});

test("proyectar clips to [p1, p99] but never moves a constant", () => {
  assert.equal(proyectar(10, -4, 3, { p1: 0, p99: 100 }), 0); // 10 − 12 = −2 → clip 0
  assert.equal(proyectar(10, 0, 6, { p1: 20, p99: 100 }), 10); // constante fuera del rango: no se toca
  assert.equal(proyectar(10, 1, 6, { p1: null, p99: 12 }), 12); // 10 + 4,5 → clip 12
  assert.equal(proyectar(10, 1, 6), 14.5);
});
