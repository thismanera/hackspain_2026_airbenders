import assert from "node:assert/strict";
import test from "node:test";
import { buildFxTable, eurRate, FX_FALLBACK, toEur } from "@/lib/features/scoring/fx";

const usd = (rate: number, month: string) => ({ currency: "USD", accounting: "EUR", rate, month });
const usdInv = (rate: number, month: string) => ({
  currency: "EUR",
  accounting: "USD",
  rate,
  month,
});

test("fx table from invoice pairs, both directions, median per month", () => {
  const fx = buildFxTable([
    usd(1.16, "2025-03"),
    usd(1.2, "2025-03"),
    usd(1.18, "2025-03"),
    usdInv(0.86, "2025-04"),
    usdInv(0.87, "2025-04"),
    usdInv(0.86, "2025-04"),
    { currency: "EUR", accounting: "EUR", rate: 1, month: "2025-04" },
    usd(0, "2025-05"),
    usd(-2, "2025-05"),
    usd(1.18, "2025-05"),
  ]);
  assert.ok(Math.abs(eurRate(fx, "USD", "2025-03")! - 1 / 1.18) < 1e-9);
  assert.equal(eurRate(fx, "USD", "2025-04"), 0.86);
  assert.equal(eurRate(fx, "EUR", "2025-01"), 1);
  assert.ok(eurRate(fx, "GBP", "2025-01")! > 1); // respaldo fijo
  assert.equal(eurRate(fx, "XXX", "2025-01"), null);
  assert.equal(eurRate(fx, "USD", "2025-05"), FX_FALLBACK.USD); // rate <= 0 ignorado → 1 muestra
});

test("a month needs three samples and a sane median to enter the table", () => {
  const pocas = buildFxTable([usd(1.5, "2025-03"), usd(1.5, "2025-03")]);
  assert.equal(eurRate(pocas, "USD", "2025-03"), FX_FALLBACK.USD);
  const absurda = buildFxTable([usd(0.05, "2025-03"), usd(0.05, "2025-03"), usd(0.05, "2025-03")]);
  assert.equal(eurRate(absurda, "USD", "2025-03"), FX_FALLBACK.USD); // 20 €/USD: > 5x el respaldo
  const baja = buildFxTable([usd(100, "2025-03"), usd(100, "2025-03"), usd(100, "2025-03")]);
  assert.equal(eurRate(baja, "USD", "2025-03"), FX_FALLBACK.USD); // 0,01 €/USD: < respaldo / 5
  const sinRespaldo = buildFxTable([
    { currency: "ZZZ", accounting: "EUR", rate: 4, month: "2025-03" },
    { currency: "ZZZ", accounting: "EUR", rate: 4, month: "2025-03" },
    { currency: "ZZZ", accounting: "EUR", rate: 4, month: "2025-03" },
  ]);
  assert.equal(eurRate(sinRespaldo, "ZZZ", "2025-03"), 0.25); // sin respaldo no hay nada que contrastar
  assert.equal(eurRate(sinRespaldo, "ZZZ", "2025-04"), null); // otro mes: ni tabla ni respaldo
});

test("toEur applies the two steps and rejects unconvertible rows", () => {
  const fx = buildFxTable([usd(1.16, "2025-03"), usd(1.16, "2025-03"), usd(1.16, "2025-03")]);
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
