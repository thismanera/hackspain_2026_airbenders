import assert from "node:assert/strict";
import test from "node:test";
import { FORECAST_PARAMS, hashForecastParams, HORIZONTES } from "@/lib/features/forecast/params";

test("amortiguacion covers the longest horizon and is 1 for the first three months", () => {
  assert.equal(FORECAST_PARAMS.amortiguacion.length, Math.max(...HORIZONTES));
  assert.deepEqual(FORECAST_PARAMS.amortiguacion.slice(0, 3), [1, 1, 1]);
  assert.deepEqual(FORECAST_PARAMS.amortiguacion.slice(3), [0.5, 0.5, 0.5]);
});

test("hash is stable for a copy of FORECAST_PARAMS and changes with any value", () => {
  assert.equal(hashForecastParams(FORECAST_PARAMS), hashForecastParams({ ...FORECAST_PARAMS }));
  assert.notEqual(
    hashForecastParams(FORECAST_PARAMS),
    hashForecastParams({ ...FORECAST_PARAMS, umbralDireccion: 7 }),
  );
});
