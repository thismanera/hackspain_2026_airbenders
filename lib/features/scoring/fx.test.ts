import assert from "node:assert/strict";
import test from "node:test";
import { buildFxTable, eurRate, toEur } from "@/lib/features/scoring/fx";

test("fx table from invoice pairs, both directions, median per month", () => {
  const fx = buildFxTable([
    { currency: "USD", accounting: "EUR", rate: 1.16, month: "2025-03" },
    { currency: "USD", accounting: "EUR", rate: 1.2, month: "2025-03" },
    { currency: "USD", accounting: "EUR", rate: 1.18, month: "2025-03" },
    { currency: "EUR", accounting: "USD", rate: 0.86, month: "2025-04" },
    { currency: "EUR", accounting: "EUR", rate: 1, month: "2025-04" },
  ]);
  assert.ok(Math.abs(eurRate(fx, "USD", "2025-03")! - 1 / 1.18) < 1e-9);
  assert.ok(Math.abs(eurRate(fx, "USD", "2025-04")! - 0.86) < 1e-9);
  assert.equal(eurRate(fx, "EUR", "2025-01"), 1);
  assert.ok(eurRate(fx, "GBP", "2025-01")! > 1); // respaldo fijo
  assert.equal(eurRate(fx, "XXX", "2025-01"), null);
});

test("toEur applies the two steps and rejects unconvertible rows", () => {
  const fx = buildFxTable([{ currency: "USD", accounting: "EUR", rate: 1.16, month: "2025-03" }]);
  // cuenta USD de empresa EUR: rate 1.16 → 116 USD = 100 EUR
  assert.ok(Math.abs(toEur(fx, 116, 1.16, "USD", "EUR", "2025-03")! - 100) < 1e-9);
  // cuenta USD de empresa USD: rate 1 → 100 USD × 1/1.16 EUR
  assert.ok(Math.abs(toEur(fx, 100, 1, "USD", "USD", "2025-03")! - 100 / 1.16) < 1e-9);
  // rate vacío, monedas iguales → 1
  assert.equal(toEur(fx, 50, null, "EUR", "EUR", "2025-03"), 50);
  // rate vacío, monedas distintas: se deriva de la tabla
  assert.ok(Math.abs(toEur(fx, 116, null, "USD", "EUR", "2025-03")! - 100) < 1e-6);
  // moneda desconocida → null
  assert.equal(toEur(fx, 10, null, "XXX", "EUR", "2025-03"), null);
});
