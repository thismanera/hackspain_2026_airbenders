import assert from "node:assert/strict";
import test from "node:test";
import { paramsFixture, rowsFromSeries } from "@/lib/features/forecast/__fixtures__/series";
import { aPrevision, previsiones } from "@/lib/features/forecast/adapter";
import { forecastRowSchema } from "@/lib/features/forecast/contracts";
import { forecastGroup } from "@/lib/features/forecast/engine";
import { FIXTURE_PERCENTILES } from "@/lib/features/scoring/__fixtures__/percentiles";

const c = rowsFromSeries("c", "g", { A1: [0.3, 0.27, 0.24, 0.21, 0.18, 0.15] });
const out = forecastGroup(
  { groupId: "g", rows: c.rows, flows: new Map([["c", c.flows]]) },
  paramsFixture(),
  FIXTURE_PERCENTILES,
);

test("engine output satisfies the §8 contract", () => {
  for (const f of out) assert.deepEqual(forecastRowSchema.parse(f), f);
});

test("contract rejects a score outside [0, 100] and a month outside the calendar", () => {
  const f = out[0];
  assert.throws(() =>
    forecastRowSchema.parse({
      ...f,
      horizontes: { ...f.horizontes, 3: { ...f.horizontes[3], scorePred: 101 } },
    }),
  );
  assert.throws(() => forecastRowSchema.parse({ ...f, month: "2020-01" }));
});

test("adapter maps a forecast row to decision's PrevisionInput keyed by company|month", () => {
  const p = aPrevision(out[5]);
  assert.equal(p.bandaPred3m, out[5].horizontes[3].bandaPred);
  assert.equal(p.scorePred3m, out[5].horizontes[3].scorePred);
  assert.equal(p.metodo, "v1_proyeccion");
  assert.equal(previsiones(out).get(`c|${out[5].month}`)?.direccionPred, out[5].direccionPred);
});
