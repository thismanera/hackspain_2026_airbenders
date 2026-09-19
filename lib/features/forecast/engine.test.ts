import assert from "node:assert/strict";
import test from "node:test";

import { forecastRowSchema } from "@/lib/features/forecast/contracts";
import { forecastGroup } from "@/lib/features/forecast/engine";
import { HORIZONTES, type ForecastParameters } from "@/lib/features/forecast/params";
import type { ForecastGroupInput, MonthlyFlow } from "@/lib/features/forecast/types";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";
import { VARIABLES } from "@/lib/features/scoring/params";
import type { Percentiles } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

function params(): ForecastParameters {
  const clip = Object.fromEntries(
    VARIABLES.map((id) => [id, { p1: null, p99: null }]),
  ) as ForecastParameters["clip"];
  const target = {
    residuos: {
      3: Object.fromEntries(["A", "B", "C", "D"].map((b) => [b, { p10: 0, p90: 0 }])),
      6: Object.fromEntries(["A", "B", "C", "D"].map((b) => [b, { p10: 0, p90: 0 }])),
    },
    pDet: Object.fromEntries(
      ["A", "B", "C", "D"].map((b) => [b, { A: null, B: null, C: null, D: null }]),
    ),
    conectado: true,
    ajuste: { filas3m: 0, mae3m: null, mae3mBaseline: null },
  } as ForecastParameters["solo"];
  return {
    version: "forecast-test",
    paramsHash: "hash",
    versionScoring: "score-test",
    clip,
    solo: target,
    grupo: target,
    residuos: target.residuos,
    pDet: target.pDet,
    conectado: true,
    ajuste: target.ajuste,
  };
}

const percentiles = Object.fromEntries(
  VARIABLES.map((id) => [id, { p5: null, p95: null }]),
) as Percentiles;

function group(months: number): ForecastGroupInput {
  const rows = CALENDAR.slice(0, months).map((month, i) => {
    const variables = scoreRowFixture().variables.map((variable) =>
      variable.id === "A1" ? { ...variable, raw: 0.1 + i * 0.01 } : variable,
    );
    return scoreRowFixture({
      company: "c",
      month,
      variables,
      scoreSolo: 70 + i,
      scoreGrupo: 70 + i,
    });
  });
  const flow: MonthlyFlow[] = CALENDAR.map((_, i) => ({
    observed: i < months,
    cobrosOp: 100,
    pagosOp: 80,
    servicioDeuda: 5,
    dispCredito: 0,
    amortCredito: 0,
  }));
  return { groupId: "g", rows, flows: new Map([["c", flow]]) };
}

test("forecast dual devuelve dos objetivos, límites e intervalos ordenados", () => {
  const input = group(8);
  const first = forecastGroup(input, params(), percentiles);
  const second = forecastGroup(input, params(), percentiles);
  assert.deepEqual(first, second);
  assert.ok(first.length > 0);
  for (const row of first) {
    forecastRowSchema.parse(row);
    for (const h of HORIZONTES) {
      const horizon = row.horizontes[h];
      assert.ok(horizon.scoreSoloPred >= 0 && horizon.scoreSoloPred <= 100);
      assert.ok(horizon.scoreGrupoPred >= 0 && horizon.scoreGrupoPred <= 100);
      assert.ok(horizon.p10Solo <= horizon.p90Solo);
      assert.ok(horizon.p10Grupo <= horizon.p90Grupo);
      const solo = horizon.cascadaPred
        .filter((contribution) => contribution.id !== "holding")
        .reduce((sum, contribution) => sum + contribution.aportacion, 0);
      const holding = horizon.cascadaPred.find((contribution) => contribution.id === "holding");
      assert.ok(Math.abs(solo - horizon.scoreSoloPred) < 1e-8);
      assert.ok(Math.abs(solo + (holding?.aportacion ?? 0) - horizon.scoreGrupoPred) < 1e-8);
    }
  }
});

test("forecast marca variables sin tendencia cuando la historia es corta", () => {
  const rows = forecastGroup(group(3), params(), percentiles);
  assert.ok(rows.length > 0);
  assert.ok(rows.at(-1)!.sinTendencia.includes("A1"));
});

test("forecast at a month does not read rows or flows from later months", () => {
  const full = forecastGroup(group(12), params(), percentiles);
  const truncated = forecastGroup(group(8), params(), percentiles);
  const month = CALENDAR[7];
  assert.deepEqual(
    full.find((row) => row.month === month),
    truncated.find((row) => row.month === month),
  );
});
