import assert from "node:assert/strict";
import test from "node:test";
import { banda, ORDEN } from "@/lib/features/decision/limit";
import { flowsLineal, rowsFromSeries, SANA } from "@/lib/features/forecast/__fixtures__/series";
import { fitClip, fitForecast } from "@/lib/features/forecast/fit";
import { FIXTURE_PERCENTILES } from "@/lib/features/scoring/__fixtures__/percentiles";
import { detectEvents } from "@/lib/features/scoring/backtest";
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

test("fitForecast: residual tables bracket zero and conectado follows the MAE gate", () => {
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
});

test("fitForecast: a P_det row over minObsCelda feeds every thin cell of that row", () => {
  const n = CALENDAR.length;
  // Tres empresas planas (valores SANA, 100 k / 85 k ⇒ sin déficit ni eventos) llenan la fila…
  const plana = (company: string) =>
    rowsFromSeries(company, "g", { A1: Array(n).fill(SANA.A1) as number[] });
  const planas = ["p1", "p2", "p3"].map(plana);
  // …y una cuarta entra en déficit sostenido (evento de deterioro) con A1 a la baja: su banda
  // prevista a 3 meses cae a B y deja esa celda por debajo de `minObsCelda`.
  const caida = rowsFromSeries(
    "d",
    "g",
    { A1: Array.from({ length: n }, (_, i) => 0.3 - 0.012 * i) },
    { flows: flowsLineal(n, 120_000, 60_000, 90_000) },
  );
  const empresas = [...planas, caida];
  const rows = empresas.flatMap((c) => c.rows);
  assert.ok(
    detectEvents(rows).some((e) => e.company === "d" && e.kind === "deterioro"),
    "la empresa en déficit necesita un evento de deterioro",
  );
  const p = fitForecast({
    samples: rows.flatMap((r) =>
      r.variables
        .filter((x) => x.id !== "grupo")
        .map((x) => ({ id: x.id as Sample["id"], raw: x.raw, conf: x.conf })),
    ),
    grupos: [
      {
        groupId: "g",
        rows,
        flows: new Map(empresas.map((c) => [c.rows[0].company, c.flows])),
      },
    ],
    percentiles: FIXTURE_PERCENTILES,
    versionScoring: "v",
    cutoff: CALENDAR[n - 1],
  });
  assert.ok(p.ajuste.filas3m >= 30, `${p.ajuste.filas3m}`);
  const bt = banda(planas[0].rows[0].score);
  for (const c of ORDEN) {
    const v = p.pDet[bt][c];
    assert.ok(v !== null && v >= 0 && v <= 1, `${bt}|${c}: ${v}`);
  }
  assert.ok(p.pDet[bt][bt]! > 0, "el evento de deterioro cuenta en la celda con datos propios");
  // Las celdas por debajo de `minObsCelda` (con pocas observaciones o ninguna) heredan la misma fila.
  const escasas = ORDEN.filter((c) => c !== bt).map((c) => p.pDet[bt][c]);
  assert.ok(
    escasas.every((v) => v === escasas[0]),
    JSON.stringify(p.pDet[bt]),
  );
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
