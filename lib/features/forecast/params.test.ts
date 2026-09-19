import assert from "node:assert/strict";
import test from "node:test";
import { FORECAST_PARAMS, hashForecastParams, HORIZONTES } from "@/lib/features/forecast/params";

test("amortiguacion covers the longest horizon and is 1 for the first three months", () => {
  assert.equal(FORECAST_PARAMS.amortiguacion.length, Math.max(...HORIZONTES));
  assert.deepEqual(FORECAST_PARAMS.amortiguacion.slice(0, 3), [1, 1, 1]);
  assert.deepEqual(FORECAST_PARAMS.amortiguacion.slice(3), [0.5, 0.5, 0.5]);
});

test("hash is canonical: key order does not matter", () => {
  assert.equal(hashForecastParams({ a: 1, b: 2 }), hashForecastParams({ b: 2, a: 1 }));
});
