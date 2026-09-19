import assert from "node:assert/strict";
import test from "node:test";
import { FIXTURE_PERCENTILES } from "@/lib/features/scoring/__fixtures__/percentiles";
import { aggregate, estadoConGrupo } from "@/lib/features/scoring/aggregate";
import { scoreRowSchema } from "@/lib/features/scoring/contracts";
import {
  earlyWarning,
  prepareGroup,
  scoreGroup,
  trajectory,
  type GroupInput,
} from "@/lib/features/scoring/engine";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";
import { perfilGrupo } from "@/lib/features/scoring/group";
import { hashParams, PARAMS } from "@/lib/features/scoring/params";
import type { Parameters, Product, Tx, VariableSet } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

const params: Parameters = {
  contratoVersion: PARAMS.contratoVersion,
  version: "v",
  paramsHash: hashParams(PARAMS),
  percentiles: FIXTURE_PERCENTILES,
  trainGroups: [],
  validationGroups: [],
  inputFingerprint: "fp",
  c5P80: null,
};
function tx(id: string, company: string, month: string, amount: number, category: string): Tx {
  return {
    id,
    company,
    product: `cash-${company}`,
    date: `${month}-10`,
    month,
    amount,
    category,
    counterparty: "",
  };
}
function input(months: number, monthly: (m: string, i: number) => Tx[]): GroupInput {
  const products = new Map<string, Product>([
    ["cash-f", { company: "f", type: "checking", currency: "EUR", service: "" }],
    ["cash-h", { company: "h", type: "checking", currency: "EUR", service: "" }],
  ]);
  const txs = CALENDAR.slice(0, months).flatMap((m, i) => monthly(m, i));
  return {
    groupId: "g",
    companies: [
      { id: "f", groupId: "g", currency: "EUR" },
      { id: "h", groupId: "g", currency: "EUR" },
    ],
    txs,
    invoices: new Map(),
    schedule: new Map(),
    products,
  };
}

test("rows respect the contract and exact decompositions", () => {
  const rows = scoreGroup(
    input(8, (m, i) => [
      tx(`f${i}a`, "f", m, 20_000, "collection"),
      tx(`f${i}b`, "f", m, -21_000, "payment"),
      tx(`f${i}t`, "f", m, -8_000, "tax"),
      tx(`h${i}a`, "h", m, 500_000, "collection"),
      tx(`h${i}b`, "h", m, -250_000, "payment"),
      tx(`h${i}t`, "h", m, -50_000, "tax"),
      tx(`h${i}m`, "h", m, -5_000, "transfer"),
      tx(`f${i}m`, "f", m, 5_000, "collection"),
    ]),
    params,
  );
  assert.equal(rows.length, 2 * CALENDAR.length);
  for (const r of rows) {
    scoreRowSchema.parse(r);
    assert.ok(Math.abs(r.variables.reduce((a, c) => a + c.aportacion, 0) - r.scoreSolo) < 1e-6);
    assert.ok(r.scoreSolo >= 0 && r.scoreSolo <= 100);
  }
  const f = rows.filter((r) => r.company === "f");
  for (let i = 1; i < f.length; i++)
    assert.ok(
      Math.abs(
        f[i].deltaContrib.reduce((a, d) => a + d.delta, 0) - (f[i].scoreSolo - f[i - 1].scoreSolo),
      ) < 1e-6,
    );
  const f7 = f[7];
  assert.ok(f7.ajusteHolding >= 0, "rich sibling should not alter autonomous score");
  assert.ok(Math.abs(f7.aportacionGrupo - f7.ajusteHolding) < 1e-9);
  assert.ok(f7.cobrosOpMedia6m < 20_001, "mirrored inflow is not a cobro");
});

test("months without data give score 50, no usable confidence, sin_datos; later data never changes an earlier row", () => {
  const a = scoreGroup(
    input(3, (m, i) => [tx(`f${i}`, "f", m, 100, "collection")]),
    params,
  );
  const b = scoreGroup(
    input(6, (m, i) => [tx(`f${i}`, "f", m, i < 3 ? 100 : -900, i < 3 ? "collection" : "payment")]),
    params,
  );
  const fa = a.filter((r) => r.company === "f"),
    fb = b.filter((r) => r.company === "f");
  assert.equal(fa[2].scoreSolo, fb[2].scoreSolo);
  const empty = a.find((r) => r.company === "h" && r.month === CALENDAR[0])!;
  assert.ok(Math.abs(empty.scoreSolo - 50) < 1e-9);
  // Sin datos toda la confianza es 0 salvo A5: sin línea de crédito la variable es NA pero con la
  // confianza fija de `a5SinLineaConf` (saber que no hay línea es información, §4.1).
  assert.equal(empty.confianza, 0);
  assert.ok(empty.confianza < PARAMS.confSinDatos);
  assert.equal(empty.estadoGrupo, "sin_datos");
});

test("prepareGroup exposes history per company", () => {
  const p = prepareGroup(input(2, (m, i) => [tx(`f${i}`, "f", m, 100, "collection")]));
  assert.equal(p.get("f")!.history.filter(Boolean).length, 2);
  assert.equal(p.get("h")!.history.filter(Boolean).length, 0);
});

/** Grupo de una sola empresa: sin hermanas no hay bloque D que ponderar. */
function solo(months: number, monthly: (m: string, i: number) => Tx[]): GroupInput {
  return {
    groupId: "g1",
    companies: [{ id: "f", groupId: "g1", currency: "EUR" }],
    txs: CALENDAR.slice(0, months).flatMap((m, i) => monthly(m, i)),
    invoices: new Map(),
    schedule: new Map(),
    products: new Map<string, Product>([
      ["cash-f", { company: "f", type: "checking", currency: "EUR", service: "" }],
    ]),
  };
}

/** f pequeña y h rica, con traspaso intragrupo mensual de 20 k (D5 por encima de la saturación). */
function pareja(months: number, skipSiblingAt: number | null = null): GroupInput {
  return input(months, (m, i) => [
    tx(`f${i}a`, "f", m, 10_000, "collection"),
    tx(`f${i}b`, "f", m, -12_000, "payment"),
    tx(`f${i}t`, "f", m, -3_000, "tax"),
    tx(`f${i}m`, "f", m, 20_000, "collection"),
    ...(i === skipSiblingAt
      ? []
      : [
          tx(`h${i}a`, "h", m, 800_000, "collection"),
          tx(`h${i}b`, "h", m, -300_000, "payment"),
          tx(`h${i}t`, "h", m, -60_000, "tax"),
          tx(`h${i}m`, "h", m, -20_000, "transfer"),
        ]),
  ]);
}

test("a sibling with one empty month keeps its 12-month evidence: D1 and the aval do not flicker", () => {
  const gap = 6;
  const base = scoreGroup(pareja(9), params).filter((r) => r.company === "f");
  const rows = scoreGroup(pareja(9, gap), params).filter((r) => r.company === "f");
  assert.ok(base[gap].ajusteHolding >= 0, "baseline: the rich sibling is evaluated independently");
  // La hermana sigue contando: el peso de grupo de f no salta a 1 ni pierde el aval por un hueco.
  assert.equal(rows[gap].cobertura.nHermanasConDatos, 1);
  assert.ok(rows[gap].D1 < 0.2, `D1 ${rows[gap].D1}`);
  assert.ok(
    Math.abs(rows[gap].D1 - rows[gap - 1].D1) < 0.05,
    `D1 ${rows[gap - 1].D1} -> ${rows[gap].D1}`,
  );
  assert.ok(rows[gap].ajusteHolding >= 0, `ajuste ${rows[gap].ajusteHolding}`);
  assert.equal(rows[gap].D2 !== null, true);
});

test("a single-company group has no aval and no interdependence", () => {
  const rows = scoreGroup(
    solo(8, (m, i) => [
      tx(`f${i}a`, "f", m, 10_000, "collection"),
      tx(`f${i}b`, "f", m, -5_000, "payment"),
      tx(`f${i}t`, "f", m, -1_000, "tax"),
    ]),
    params,
  );
  assert.equal(rows.length, CALENDAR.length);
  for (const r of rows) {
    scoreRowSchema.parse(r);
    assert.equal(r.ajusteHolding, 0);
    assert.equal(r.D5, 0);
    assert.equal(r.D2, null);
    assert.equal(r.confD, 0);
    assert.equal(r.cobertura.nHermanasConDatos, 0);
    assert.equal(r.scoreGrupo, r.scoreSolo);
    assert.equal(r.aportacionGrupo, 0);
  }
});

test("a persistent deficit raises deficit_persistente from the month the run started", () => {
  const start = 3;
  const rows = scoreGroup(
    solo(9, (m, i) =>
      i < start
        ? [tx(`f${i}a`, "f", m, 30_000, "collection"), tx(`f${i}b`, "f", m, -10_000, "payment")]
        : [tx(`f${i}a`, "f", m, 10_000, "collection"), tx(`f${i}b`, "f", m, -30_000, "payment")],
    ),
    params,
  );
  const alerta = (t: number) => rows[t].alertas.find((a) => a.tipo === "deficit_persistente");
  assert.equal(rows[start].deficitMes, true);
  assert.equal(alerta(start), undefined, "one month of deficit is not persistent");
  assert.equal(alerta(start + 1), undefined, "two months of deficit are not persistent either");
  assert.deepEqual(alerta(start + 2), { tipo: "deficit_persistente", desdeMes: CALENDAR[start] });
  assert.equal(rows[start + 2].rachaDeficit, 3);
});

test("scoreGroup is deterministic", () => {
  const i = pareja(9);
  assert.deepEqual(scoreGroup(i, params), scoreGroup(i, params));
});

test("autonomous contributions and holding adjustment stay separately decomposable", () => {
  const rows = scoreGroup(pareja(12), params);
  const f = rows.filter((r) => r.company === "f");
  assert.ok(f[11].D5 >= PARAMS.holding.saturacionD5, `D5 ${f[11].D5}`);
  assert.ok(Math.abs(f[11].ajusteHolding) >= 0, `ajuste ${f[11].ajusteHolding}`);
  for (const r of rows) {
    assert.ok(
      Math.abs(r.variables.reduce((a, c) => a + c.aportacion, 0) - r.scoreSolo) < 1e-9,
      `${r.company} ${r.month}`,
    );
    assert.equal(r.scoreGrupo, r.scoreSolo + r.ajusteHolding, "scoreGrupo aplica el holding");
  }
});

test("a debt-free company reallocates A to A1/A2 and keeps the autonomous score high", () => {
  const vars = Object.fromEntries(
    [...PARAMS.bloques.A, ...PARAMS.bloques.B, ...PARAMS.bloques.C].map((id) => [
      id,
      { raw: null, conf: 0 },
    ]),
  ) as VariableSet;
  Object.assign(vars, {
    A1: { raw: 0.2, conf: 1 },
    A2: { raw: 0, conf: 1 },
    B1: { raw: 1, conf: 1 },
    B2: { raw: 0, conf: 1 },
    B3: { raw: 0, conf: 1 },
    C1: { raw: 0.3, conf: 1 },
    C2: { raw: 0.3, conf: 1 },
    C3: { raw: 0, conf: 1 },
    C4: { raw: 0, conf: 1 },
    C5: { raw: 0.1, conf: 1 },
    C6: { raw: 0, conf: 1 },
  });
  const result = aggregate(vars, { rachaB2Prev: [0, 0, 0] }, FIXTURE_PERCENTILES, {
    tieneCuotas: false,
    tieneLineaCredito: false,
  });
  assert.ok(result.scoreSolo >= 75);
  assert.equal(result.contributions.find((c) => c.id === "A3")?.subnota, null);
  assert.equal(result.contributions.find((c) => c.id === "A3")?.aplicable, false);
  assert.equal(result.contributions.find((c) => c.id === "A5")?.aportacion, 0);
  assert.equal(result.confs.A, 1);
});

test("critical C4/C6 weights dominate a C1 concentration change", () => {
  const base = Object.fromEntries(
    [...PARAMS.bloques.A, ...PARAMS.bloques.B, ...PARAMS.bloques.C].map((id) => [
      id,
      { raw: 0, conf: 1 },
    ]),
  ) as VariableSet;
  base.A1 = { raw: 0.2, conf: 1 };
  base.B1 = { raw: 1, conf: 1 };
  base.B2 = { raw: 0, conf: 1 };
  base.C1 = { raw: 0.2, conf: 1 };
  base.C4 = { raw: 0, conf: 1 };
  base.C6 = { raw: 0, conf: 1 };
  const clean = aggregate(base, { rachaB2Prev: [0, 0, 0] }, FIXTURE_PERCENTILES, {
    tieneCuotas: false,
    tieneLineaCredito: false,
  });
  const stressed = aggregate(
    { ...base, C1: { raw: 0.9, conf: 1 }, C4: { raw: 0.6, conf: 1 }, C6: { raw: 0.1, conf: 1 } },
    { rachaB2Prev: [0, 0, 0] },
    FIXTURE_PERCENTILES,
    { tieneCuotas: false, tieneLineaCredito: false },
  );
  assert.ok(clean.scoreSolo - stressed.scoreSolo > 8);
});

test("autonomous risk cannot be disguised by a positive holding aval", () => {
  assert.equal(
    estadoConGrupo("riesgo", 75, 0.8, "filial_subvencionada", 20, 0, {} as VariableSet),
    "vigilar",
  );
  assert.equal(estadoConGrupo("riesgo", 75, 0.8, "estandar", 20, 0, {} as VariableSet), "riesgo");
});

test("holding profiles distinguish subsidy from treasury drainage", () => {
  assert.equal(perfilGrupo(-1, -0.2, -0.1, 65, 0.4, 0), "filial_subvencionada");
  assert.equal(perfilGrupo(1, 0.2, 0.15, 45, -0.8, 0), "drenaje_tesoreria");
  assert.equal(perfilGrupo(1, 0.2, 0.15, 45, -0.2, 0), "estandar");
});

test("a single bad month after a healthy run is an early warning and a bache", () => {
  const start = 6;
  const rows = scoreGroup(
    solo(8, (m, i) =>
      i < start
        ? [
            tx(`healthy-in-${i}`, "f", m, 30_000, "collection"),
            tx(`healthy-out-${i}`, "f", m, -10_000, "payment"),
          ]
        : [
            tx(`bad-in-${i}`, "f", m, -10_000, "collection"),
            tx(`bad-out-${i}`, "f", m, -50_000, "payment"),
          ],
    ),
    params,
  ).filter((r) => r.company === "f");
  assert.equal(rows[start].alertaTempranaDeterioro, true);
  assert.equal(rows[start].patronTrayectoria, "bache_puntual");
  assert.equal(rows[start].estadoSolo === "riesgo", false);
});

test("C6 only warns when a returned-receipt ratio is new or increasing", () => {
  const base = scoreRowFixture();
  const withC6 = (raw: number | null) =>
    scoreRowFixture({
      variables: base.variables.map((variable) =>
        variable.id === "C6" ? { ...variable, raw } : variable,
      ),
    });
  const previous = withC6(0.2);
  assert.equal(earlyWarning(80, previous, [], false, 0, null, 0.2), false);
  assert.equal(earlyWarning(80, previous, [], false, 0, null, 0.1), false);
  assert.equal(earlyWarning(80, previous, [], false, 0, null, 0.3), true);
  assert.equal(earlyWarning(80, withC6(null), [], false, 0, null, 0.1), true);
});

test("non-structural deterioration has an explicit temporal trajectory", () => {
  const current = scoreRowFixture({ direccion: "deterioro", scoreSolo: 60 });
  const previous = scoreRowFixture({ direccion: "estable", scoreSolo: 64 });
  assert.equal(trajectory(current, previous, undefined, null, null, [], 0), "deterioro_temporal");
});
