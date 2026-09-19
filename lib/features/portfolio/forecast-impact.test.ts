import assert from "node:assert/strict";
import { test } from "node:test";

import { anticipation, forecastImpact, impactSentence, MARKET_APR } from "./forecast-impact";
import type { Decision } from "./types";

function decision(overrides: Partial<Decision>): Decision {
  return {
    eligible: true,
    reason: "",
    gates: [],
    band: "B",
    limit: 80_000,
    previousLimit: 80_000,
    maxTenorDays: 120,
    baseApr: 7,
    apr: 7.5,
    aprBreakdown: {
      base: 7,
      tenorPremium: 0,
      confidencePremium: 0.5,
      trendAdjustment: 0,
      forecastPremium: 0,
    },
    menu: [],
    action: "mantener",
    adverseCapacity: 10_000,
    capacityLimit: 120_000,
    operatingLimit: 150_000,
    ...overrides,
  };
}

test("bajar de B a C encarece la TAE, recorta el límite y cuesta intereses", () => {
  const impact = forecastImpact(decision({}), 55);
  assert.equal(impact.bandNow, "B");
  assert.equal(impact.bandPred, "C");
  assert.equal(impact.tone, "deterioro");
  // 80 k / 0,7 × 0,4 ≈ 45,7 k → 46 k
  assert.equal(impact.limitPred, 46_000);
  assert.equal(impact.limitDelta, -34_000);
  // La prima de confianza (0,5) se conserva; solo cambia el tramo base 7 → 10.
  assert.equal(impact.aprPred, 10.5);
  // 80 k × (7,5 − 10,5) / 100 = −2.400 €/año
  assert.equal(impact.annualDelta, -2400);
  assert.equal(anticipation(impact), "Preparar condición de preaviso");
});

test("subir de B a A abarata y amplía", () => {
  const impact = forecastImpact(decision({}), 78);
  assert.equal(impact.tone, "mejora");
  assert.equal(impact.limitPred, 114_000);
  assert.equal(impact.aprPred, 5.5);
  assert.equal(impact.annualDelta, 1600);
  assert.equal(anticipation(impact), "Preparar ampliación");
  assert.match(impactSentence(impact, "tu"), /subirías a banda A/);
  assert.match(impactSentence(impact), /subiría a banda A/);
});

test("misma banda: sin cambios y sin dinero en juego", () => {
  const impact = forecastImpact(decision({}), 66);
  assert.equal(impact.tone, "igual");
  assert.equal(impact.annualDelta, 0);
  assert.equal(impact.limitDelta, 0);
  assert.equal(anticipation(impact), null);
  assert.match(impactSentence(impact), /seguiría en banda B/);
});

test("caer a D pierde la línea y el coste es financiarse fuera a precio de mercado", () => {
  const impact = forecastImpact(decision({}), 40);
  assert.equal(impact.bandPred, "D");
  assert.equal(impact.limitPred, 0);
  assert.equal(impact.aprPred, null);
  assert.equal(impact.annualDelta, -Math.round((80_000 * (MARKET_APR - 7.5)) / 100));
  assert.equal(anticipation(impact), "Revisar la línea antes de 3 meses");
  assert.match(impactSentence(impact, "tu"), /perderías la línea/);
});

test("sin línea hoy y banda C prevista: volvería a tener línea sobre la capacidad", () => {
  const impact = forecastImpact(
    decision({ eligible: false, band: "D", limit: 0, previousLimit: 0 }),
    50,
  );
  assert.equal(impact.tone, "mejora");
  // min(120 k, 150 k) × 0,4 = 48 k
  assert.equal(impact.limitPred, 48_000);
  assert.equal(impact.aprPred, 10);
  // Banda C (10 %) no es más barata que el mercado (8,2 %): el dinero en juego es el crédito.
  assert.equal(impact.annualDelta, 0);
  assert.equal(impact.limitDelta, 48_000);
  assert.match(impactSentence(impact), /volvería a tener línea/);
});

test("sin línea hoy y banda B prevista: el ahorro es frente al precio de mercado", () => {
  const impact = forecastImpact(
    decision({ eligible: false, band: "D", limit: 0, previousLimit: 0 }),
    65,
  );
  assert.equal(impact.limitPred, 84_000);
  assert.equal(impact.aprPred, 7);
  assert.equal(impact.annualDelta, Math.round((84_000 * (MARKET_APR - 7)) / 100));
});

test("la TAE del motor en tanto por uno se traduce a puntos, igual que la del panel", () => {
  const fromFraction = forecastImpact(decision({ apr: 0.075 }), 55);
  const fromPoints = forecastImpact(decision({ apr: 7.5 }), 55);
  assert.deepEqual(fromFraction, fromPoints);
  assert.equal(fromFraction.aprNow, 7.5);
  assert.equal(fromFraction.aprPred, 10.5);
});
