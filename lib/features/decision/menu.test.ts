import assert from "node:assert/strict";
import test from "node:test";
import { flujosCapacidad } from "@/lib/features/decision/__fixtures__/flujos";
import { menu, plazoNatural, valida } from "@/lib/features/decision/menu";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";

test("sana fixture menu: amounts grow with tenor up to L, TAE grows, capped by T_max", () => {
  const r = scoreRowFixture({
    ...flujosCapacidad(10_000),
    cobrosOpMedia3m: 100_000,
    confianza: 0.9,
    score: 82,
  });
  const m = menu(r, 120_000, 180, "A", "A");
  assert.deepEqual(
    m.map((o) => [o.plazo, o.cantidadMax, o.tae]),
    [
      [30, 10_000, 0.05],
      [60, 20_000, 0.055],
      [90, 30_000, 0.06],
      [120, 40_000, 0.065],
      [180, 60_000, 0.075],
    ],
  );
  assert.equal(m[4].costeMax, 2250);
  assert.equal(menu(r, 120_000, 60, "A", "A").length, 2);
  assert.deepEqual(menu(r, 0, 180, "A", "A"), []);
});

test("band D has no price, so it has no menu", () => {
  const r = scoreRowFixture({ ...flujosCapacidad(10_000), cobrosOpMedia3m: 100_000, score: 40 });
  assert.deepEqual(menu(r, 120_000, 180, "D", "D"), []);
});

test("valida a request against the menu; plazo natural from C3", () => {
  const r = scoreRowFixture({
    ...flujosCapacidad(10_000),
    cobrosOpMedia3m: 100_000,
    confianza: 0.9,
  });
  const m = menu(r, 120_000, 180, "A", "A");
  assert.equal(valida({ cantidad: 25_000, plazo: 90 }, m), true);
  assert.equal(valida({ cantidad: 25_000, plazo: 60 }, m), false);
  assert.equal(valida({ cantidad: 25_000, plazo: 75 }, m), true); // primera opción con plazo ≥ 75 es 90 d
  assert.equal(valida({ cantidad: 1, plazo: 200 }, m), false);
  // el borde de la región factible entra: cantidad == cantidad_max
  assert.equal(valida({ cantidad: m[2].cantidadMax, plazo: 90 }, m), true);
  assert.equal(valida({ cantidad: m[2].cantidadMax + 1, plazo: 90 }, m), false);
  assert.equal(plazoNatural(scoreRowFixture({ C3dias: 45 })), 60);
  assert.equal(plazoNatural(scoreRowFixture({ C3dias: null })), 60);
  assert.equal(plazoNatural(scoreRowFixture({ C3dias: 200 })), 180);
});
