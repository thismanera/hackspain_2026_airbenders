import assert from "node:assert/strict";
import { test } from "node:test";

import { CALENDAR, LATEST_MONTH } from "./calendar";
import type { Dataset } from "./dataset";
import {
  benchmarkFrom,
  companyFileFrom,
  groupFileFrom,
  portfolioFrom,
  type CohortStats,
  type PortfolioLiteRow,
} from "./derive";
import { buildPortfolio } from "./fixtures";
import { peerMapFrom } from "./peer-map";
import {
  benchmarkFromSnapshot,
  companyFileFromSnapshot,
  groupKey,
  materialize,
  portfolioFromSnapshot,
  SNAPSHOT_KIND,
  type CompanySnapshot,
  type SnapshotRow,
} from "./snapshots";
import { scopePeerMap } from "./peer-map";
import type { GroupFileResponse, PeerMapResponse, PortfolioResponse } from "./types";

const companies = buildPortfolio();
const dataset: Dataset = {
  runId: "test",
  parameterVersion: "test",
  completedAt: null,
  engine: null,
  companies,
};

const rows = [...materialize(dataset, new Date(0))];
const table = new Map(rows.map((row) => [`${row.kind}/${row.key}`, row]));

function read<T>(kind: SnapshotRow["kind"], key: string): T {
  const row = table.get(`${kind}/${key}`);
  assert.ok(row, `falta ${kind}/${key}`);
  return row.payload as T;
}

/** Pasa por JSON, como Postgres: lo que se compara es lo que la UI recibiría. */
function roundtrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test("hay una fila por mes de cada respuesta de cartera, una por empresa y la meta", () => {
  for (const month of CALENDAR) {
    for (const kind of [
      SNAPSHOT_KIND.portfolio,
      SNAPSHOT_KIND.portfolioLite,
      SNAPSHOT_KIND.groups,
      SNAPSHOT_KIND.alerts,
      SNAPSHOT_KIND.backtest,
      SNAPSHOT_KIND.cohort,
      SNAPSHOT_KIND.peers,
    ])
      assert.ok(table.has(`${kind}/${month}`), `${kind} ${month}`);
  }
  for (const id of companies.keys()) assert.ok(table.has(`${SNAPSHOT_KIND.company}/${id}`));
  const meta = read<{ companies: number; months: string[] }>(SNAPSHOT_KIND.meta, "run");
  assert.equal(meta.companies, companies.size);
  assert.deepEqual(meta.months, CALENDAR);
  const keys = rows.map((row) => `${row.kind}/${row.key}`);
  assert.equal(new Set(keys).size, keys.length, "claves duplicadas");
});

test("la cartera sin filtro es la fila tal cual; con filtro reproduce derive.ts", () => {
  const month = CALENDAR[10];
  const full = roundtrip(read<PortfolioResponse>(SNAPSHOT_KIND.portfolio, month));
  const lite = (past: string) =>
    roundtrip(read<PortfolioLiteRow[]>(SNAPSHOT_KIND.portfolioLite, past));
  assert.equal(portfolioFromSnapshot(full, { month }, lite), full);
  assert.deepEqual(full, roundtrip(portfolioFrom(dataset, { month })));

  for (const filters of [
    { month, estado: "riesgo" as const },
    { month, accion: "cerrar" as const },
    { month, direccion: "deterioro" as const, banda: "C" as const },
    { month, q: "group_0" },
  ]) {
    assert.deepEqual(
      portfolioFromSnapshot(full, filters, lite),
      roundtrip(portfolioFrom(dataset, filters)),
      JSON.stringify(filters),
    );
  }
});

test("la ficha recortada por mes coincide con la ficha calculada", () => {
  for (const id of companies.keys()) {
    const snapshot = roundtrip(read<CompanySnapshot>(SNAPSHOT_KIND.company, id));
    for (const month of [LATEST_MONTH, CALENDAR[3], CALENDAR[0]]) {
      assert.deepEqual(
        companyFileFromSnapshot(snapshot, month),
        roundtrip(companyFileFrom(dataset, id, month)),
        `${id} ${month}`,
      );
    }
  }
});

test("un snapshot sin impacto en euros completa la previsión al leer la ficha", () => {
  const id = [...companies.keys()][0]!;
  const snapshot = roundtrip(read<CompanySnapshot>(SNAPSHOT_KIND.company, id));
  for (const point of snapshot.history) {
    if (!point.forecast) continue;
    const { impact: _impact, bandaSoloPred3m: _b3, bandaSoloPred6m: _b6, ...rest } = point.forecast;
    point.forecast = rest as typeof point.forecast;
  }
  const file = companyFileFromSnapshot(snapshot, LATEST_MONTH);
  const expected = companyFileFrom(dataset, id, LATEST_MONTH);
  assert.ok(file?.latest.forecast?.impact);
  assert.ok(expected?.latest.forecast);
  assert.equal(file.latest.forecast.impact.tone, expected.latest.forecast.impact.tone);
  assert.equal(file.latest.forecast.bandaSoloPred3m, expected.latest.forecast.bandaSoloPred3m);
});

test("el benchmark desde la cohorte materializada coincide con el calculado", () => {
  for (const month of [LATEST_MONTH, CALENDAR[5]]) {
    const cohort = roundtrip(read<CohortStats>(SNAPSHOT_KIND.cohort, month));
    for (const id of companies.keys()) {
      const snapshot = roundtrip(read<CompanySnapshot>(SNAPSHOT_KIND.company, id));
      assert.deepEqual(
        benchmarkFromSnapshot(snapshot, cohort),
        roundtrip(benchmarkFrom(dataset, id, month)),
        `${id} ${month}`,
      );
    }
  }
});

test("grupo y pares: la fila es la respuesta; el scope empresa se aplica al leer", () => {
  const month = CALENDAR[12];
  const groupId = companies.values().next().value!.meta.groupId;
  assert.deepEqual(
    read<GroupFileResponse>(SNAPSHOT_KIND.group, groupKey(groupId, month)),
    groupFileFrom(dataset, groupId, month),
  );
  const partner = roundtrip(read<PeerMapResponse>(SNAPSHOT_KIND.peers, month));
  assert.deepEqual(partner, roundtrip(peerMapFrom(dataset, { month, scope: "partner" })));
  const focus = [...companies.keys()][7];
  assert.deepEqual(
    scopePeerMap(partner, { scope: "embat", company: focus }),
    roundtrip(peerMapFrom(dataset, { month, scope: "embat", company: focus })),
  );
  assert.equal(scopePeerMap(partner, { scope: "embat", company: "NADIE" }).focus, null);
});
