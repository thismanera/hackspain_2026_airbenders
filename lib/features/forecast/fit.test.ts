import assert from "node:assert/strict";
import test from "node:test";
import { flowsLineal, rowsFromSeries } from "@/lib/features/forecast/__fixtures__/series";
import { fitClip, fitForecast } from "@/lib/features/forecast/fit";
import { FIXTURE_PERCENTILES } from "@/lib/features/scoring/__fixtures__/percentiles";
import type { Sample } from "@/lib/features/scoring/fit";
import { CALENDAR } from "@/lib/features/scoring/windows";

test("fitClip freezes p1/p99 per variable over reliable samples only", () => {
  const samples: Sample[] = Array.from({ length: 101 }, (_, i) => ({ id: "A1", raw: i, conf: 1 }));
  samples.push({ id: "A1", raw: 1000, conf: 0.1 }); // conf < confSana: fuera
  samples.push({ id: "A1", raw: null, conf: 1 });
  const clip = fitClip(samples);
  assert.deepEqual(clip.A1, { p1: 1, p99: 99 });
  assert.deepEqual(clip.C6, { p1: null, p99: null });
});

test("fitForecast: residual tables bracket zero, P_det inherits the row, and conectado follows the MAE gate", () => {
  // 24 meses con tendencia: la previsión ingenua (score constante) falla más que la proyección
  const n = CALENDAR.length;
  const c = rowsFromSeries(
    "c",
    "g",
    {
      A1: Array.from({ length: n }, (_, i) => 0.3 - 0.01 * i),
      A4: Array.from({ length: n }, (_, i) => 0.05 + 0.01 * i),
    },
    { flows: flowsLineal(n, 150_000, 90_000, 80_000) },
  );
  const p = fitForecast({
    samples: c.rows.flatMap((r) =>
      r.variables
        .filter((x) => x.id !== "grupo")
        .map((x) => ({ id: x.id as Sample["id"], raw: x.raw, conf: x.conf })),
    ),
    grupos: [{ groupId: "g", rows: c.rows, flows: new Map([["c", c.flows]]) }],
    percentiles: FIXTURE_PERCENTILES,
    versionScoring: "v",
    cutoff: CALENDAR[n - 1],
  });
  assert.equal(p.versionScoring, "v");
  assert.ok(p.version.length > 10);
  for (const h of [3, 6] as const)
    for (const b of ["A", "B", "C", "D"] as const) {
      assert.ok(p.residuos[h][b].p10 <= 0, `${h}${b}`);
      assert.ok(p.residuos[h][b].p90 >= 0, `${h}${b}`);
    }
  assert.ok(p.ajuste.filas3m > 0);
  assert.ok(
    p.ajuste.mae3m! < p.ajuste.mae3mBaseline!,
    `${p.ajuste.mae3m} vs ${p.ajuste.mae3mBaseline}`,
  );
  assert.equal(p.conectado, true);
  // < minObsCelda observaciones en toda celda: cada fila hereda su agregado (o null sin datos)
  for (const b of ["A", "B", "C", "D"] as const) {
    const fila = Object.values(p.pDet[b]);
    assert.ok(
      fila.every((v) => v === fila[0]),
      b,
    );
  }
});

test("fitForecast without pairs is desconectado", () => {
  const c = rowsFromSeries("c", "g", { A1: [0.15, 0.15] });
  const p = fitForecast({
    samples: [],
    grupos: [{ groupId: "g", rows: c.rows, flows: new Map([["c", c.flows]]) }],
    percentiles: FIXTURE_PERCENTILES,
    versionScoring: "v",
    cutoff: CALENDAR[1],
  });
  assert.equal(p.conectado, false);
  assert.equal(p.ajuste.filas3m, 0);
  assert.deepEqual(p.residuos[3].A, { p10: 0, p90: 0 });
});
