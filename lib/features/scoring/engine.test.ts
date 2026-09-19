import assert from "node:assert/strict";
import test from "node:test";
import { FIXTURE_PERCENTILES } from "@/lib/features/scoring/__fixtures__/percentiles";
import { scoreRowSchema } from "@/lib/features/scoring/contracts";
import { prepareGroup, scoreGroup, type GroupInput } from "@/lib/features/scoring/engine";
import { hashParams, PARAMS } from "@/lib/features/scoring/params";
import type { Parameters, Product, Tx } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

const params: Parameters = {
  version: "v",
  paramsHash: hashParams(PARAMS),
  percentiles: FIXTURE_PERCENTILES,
  trainGroups: [],
  validationGroups: [],
  inputFingerprint: "fp",
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
    assert.ok(Math.abs(r.variables.reduce((a, c) => a + c.aportacion, 0) - r.score) < 1e-6);
    assert.ok(r.score >= 0 && r.score <= 100);
  }
  const f = rows.filter((r) => r.company === "f");
  for (let i = 1; i < f.length; i++)
    assert.ok(
      Math.abs(f[i].deltaContrib.reduce((a, d) => a + d.delta, 0) - (f[i].score - f[i - 1].score)) <
        1e-6,
    );
  const f7 = f[7];
  assert.ok(f7.avalGrupo > 0, "rich sibling with mirrored transfers should lift f");
  // Sin clip la aportación de grupo es el aval bruto (salvo el redondeo de `score − score_solo`).
  assert.ok(Math.abs(f7.variables.find((c) => c.id === "grupo")!.aportacion - f7.avalGrupo) < 1e-9);
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
  assert.equal(fa[2].score, fb[2].score);
  const empty = a.find((r) => r.company === "h" && r.month === CALENDAR[0])!;
  assert.ok(Math.abs(empty.scoreSolo - 50) < 1e-9);
  // Sin datos toda la confianza es 0 salvo A5: sin línea de crédito la variable es NA pero con la
  // confianza fija de `a5SinLineaConf` (saber que no hay línea es información, §4.1).
  assert.ok(
    Math.abs(empty.confianza - PARAMS.pesos.A * (PARAMS.a5SinLineaConf / 5)) < 1e-12,
    `confianza ${empty.confianza}`,
  );
  assert.ok(empty.confianza < PARAMS.confSinDatos);
  assert.equal(empty.estado, "sin_datos");
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
  assert.ok(base[gap].avalGrupo > 0, "baseline: the rich sibling lifts f");
  // La hermana sigue contando: el peso de grupo de f no salta a 1 ni pierde el aval por un hueco.
  assert.equal(rows[gap].cobertura.nHermanasConDatos, 1);
  assert.ok(rows[gap].D1 < 0.2, `D1 ${rows[gap].D1}`);
  assert.ok(
    Math.abs(rows[gap].D1 - rows[gap - 1].D1) < 0.05,
    `D1 ${rows[gap - 1].D1} -> ${rows[gap].D1}`,
  );
  assert.ok(rows[gap].avalGrupo > 0, `aval ${rows[gap].avalGrupo}`);
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
    assert.equal(r.avalGrupo, 0);
    assert.equal(r.D5, 0);
    assert.equal(r.D2, null);
    assert.equal(r.confD, 0);
    assert.equal(r.cobertura.nHermanasConDatos, 0);
    assert.equal(r.score, r.scoreSolo);
    assert.equal(r.variables.find((c) => c.id === "grupo")!.aportacion, 0);
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

/**
 * `Σ aportaciones == score` con el término de grupo saturado (D5 ≥ d5_saturacion, w = w_max).
 * El clip de `score` en [0,100] (§7) es inalcanzable con los parámetros congelados, de ahí que la
 * aportación de grupo coincida siempre con `aval_grupo`: por arriba haría falta
 * 0,4·D2 + 0,6·score_solo > 100 con D2 ≤ 100 y score_solo ≤ 100 (el máximo es exactamente 100, y
 * en él D2 − score_solo = 0); por abajo score_solo + aval ≥ 0,6·score_solo ≥ 0 mientras el aval no
 * toque −aval_max, y si lo toca es porque score_solo − D2 > 50, luego score_solo > 50 y
 * score > 30. Por eso el test afirma la invariante sobre las filas reales en vez de forzar el clip.
 */
test("the group contribution closes the score exactly with a saturated aval", () => {
  const rows = scoreGroup(pareja(12), params);
  const f = rows.filter((r) => r.company === "f");
  assert.ok(f[11].D5 >= PARAMS.d5Saturacion, `D5 ${f[11].D5}`);
  assert.ok(Math.abs(f[11].avalGrupo) > 1, `aval ${f[11].avalGrupo}`);
  for (const r of rows) {
    assert.ok(
      Math.abs(r.variables.reduce((a, c) => a + c.aportacion, 0) - r.score) < 1e-9,
      `${r.company} ${r.month}`,
    );
    assert.equal(r.score, Math.min(100, Math.max(0, r.scoreSolo + r.avalGrupo)));
    assert.equal(r.score, r.scoreSolo + r.avalGrupo, "el clip de score nunca actúa");
  }
});
