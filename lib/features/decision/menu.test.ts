import assert from "node:assert/strict";
import test from "node:test";
import { decisionInputFixture } from "@/lib/features/decision/__fixtures__/decision-input";
import { menu, plazoNatural, valida } from "@/lib/features/decision/menu";
import { DECISION_PARAMS as P } from "@/lib/features/decision/params";

test("decisión 46: el menú es una rampa lineal hasta L en 180 d", () => {
  const r = decisionInputFixture();
  const m = menu(r, 240_000, 180, "A", "A");
  assert.deepEqual(
    m.map((o) => [o.plazo, o.cantidadMax, o.tae]),
    [
      [30, 40_000, 0.05],
      [60, 80_000, 0.055],
      [90, 120_000, 0.06],
      [120, 160_000, 0.065],
      [180, 240_000, 0.075],
    ],
  );
  // 30 d es L/6 y 180 d es L entero: la rampa llega justo al límite en `rampaDias`
  assert.equal(P.rampaDias, 180);
  assert.equal(m[0].cantidadMax, 240_000 / 6);
  assert.equal(m[4].cantidadMax, 240_000);
  assert.equal(m[4].costeMax, 9000);
  assert.equal(menu(r, 240_000, 60, "A", "A").length, 2);
  assert.deepEqual(menu(r, 0, 180, "A", "A"), []);
});

test("decisión 46: ninguna opción pasa de `L × plazo / rampaDias` ni del propio L", () => {
  for (const L of [3_000, 17_000, 240_000, 1_234_000]) {
    for (const o of menu(decisionInputFixture(), L, 180, "A", "A")) {
      assert.ok(o.cantidadMax <= L, `${L} @ ${o.plazo}`);
      assert.ok(o.cantidadMax <= (L * o.plazo) / P.rampaDias + 1e-6, `${L} @ ${o.plazo}`);
      assert.equal(o.cantidadMax % P.redondeoL, 0);
    }
  }
  // un límite por debajo del escalón en el tramo corto se queda sin esa fila
  assert.deepEqual(
    menu(decisionInputFixture(), 5_000, 180, "A", "A").map((o) => o.plazo),
    [60, 90, 120, 180],
  );
});

test("band D has no price, so it has no menu", () => {
  assert.deepEqual(menu(decisionInputFixture({ score: 40 }), 240_000, 180, "D", "D"), []);
});

test("valida a request against the menu; the natural tenor is the default one", () => {
  const m = menu(decisionInputFixture(), 240_000, 180, "A", "A");
  assert.equal(valida({ cantidad: 100_000, plazo: 90 }, m), true);
  assert.equal(valida({ cantidad: 100_000, plazo: 60 }, m), false);
  assert.equal(valida({ cantidad: 100_000, plazo: 75 }, m), true); // primera opción con plazo ≥ 75 es 90 d
  assert.equal(valida({ cantidad: 1, plazo: 200 }, m), false);
  // el borde de la región factible entra: cantidad == cantidad_max
  assert.equal(valida({ cantidad: m[2].cantidadMax, plazo: 90 }, m), true);
  assert.equal(valida({ cantidad: m[2].cantidadMax + 1, plazo: 90 }, m), false);
  // decisión 43: `C3_dias` sale del contrato, así que el plazo natural es el parámetro
  assert.equal(plazoNatural(), P.plazoNaturalDefecto);
  assert.equal(plazoNatural(), 60);
});
