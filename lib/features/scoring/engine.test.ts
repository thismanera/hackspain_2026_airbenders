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
  assert.equal(f7.variables.find((c) => c.id === "grupo")!.aportacion, f7.avalGrupo);
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
