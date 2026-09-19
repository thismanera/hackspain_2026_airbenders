import assert from "node:assert/strict";
import test from "node:test";
import { fit, groupSplit, rawAt, scoreCompany, subscore } from "@/lib/features/scoring/engine";
import {
  emptyFlow,
  months,
  monthlyFlows,
  WEIGHTS,
  type Invoice,
  type Product,
  type Tx,
} from "@/lib/features/scoring/model";

test("weights, neutral fallback, and exact contribution sums", () => {
  assert.equal(
    WEIGHTS.reduce((a, b) => a + b, 0),
    100,
  );
  const flows = new Map<string, ReturnType<typeof emptyFlow>>();
  const params = fit([], ["a", "b"], "fixture");
  const rows = scoreCompany("empty", flows, [], params);
  assert.equal(rows.length, 24);
  for (const r of rows) {
    assert.equal(r.score, 50);
    assert.equal(r.confidence, 0);
    assert.equal(r.action, "mantener");
    assert.equal(r.appliedLimit, 0);
    assert.ok(Math.abs(r.contributions.reduce((a, c) => a + c.contribution, 0) - r.score) < 1e-6);
    if (r.month !== months()[0])
      assert.ok(
        Math.abs(
          r.deltas.reduce((a, d) => a + d.delta, 0) -
            (r.score - rows[months().indexOf(r.month) - 1].score),
        ) < 1e-6,
      );
  }
  assert.equal(subscore(100, 0, { lo: 5, hi: 5 }), 50);
});

test("operational flows keep credit, transfers and refunds separate", () => {
  const products = new Map<string, Product>([
    ["cash", { company: "c", type: "checking", currency: "EUR" }],
    ["cash2", { company: "c", type: "saving", currency: "EUR" }],
    ["credit", { company: "c", type: "lineofcredit", currency: "EUR" }],
    ["usd", { company: "c", type: "checking", currency: "USD" }],
  ]);
  const make = (id: string, product: string, amount: number, category: string): Tx => ({
    id,
    company: "c",
    product,
    date: "2025-01-10",
    month: "2025-01",
    amount,
    category,
    counterparty: "x",
  });
  const tx = [
    make("1", "cash", 100, "collection"),
    make("2", "cash", -20, "payment"),
    make("3", "cash", 30, "payment_refund"),
    make("4", "cash", -10, "collection_refund"),
    make("5", "credit", 1000, "collection"),
    make("6", "cash", -100, "transfer"),
    make("7", "cash2", 100, "transfer"),
    make("8", "usd", 9000, "collection"),
  ];
  const f = monthlyFlows("c", tx, products).get("2025-01")!;
  assert.equal(f.received, 130);
  assert.equal(f.spent, 30);
  assert.equal(f.creditDraw, 1000);
  assert.equal(f.collectedRefund, 10);
  assert.equal(f.unusableCount, 1);
  assert.equal(f.totalCount, 8);
});

test("invoice cutoff and missing observed months", () => {
  const flow = emptyFlow("c", "2025-01");
  flow.observed = true;
  flow.received = 100;
  flow.classified = 100;
  const map = new Map([[flow.month, flow]]);
  const invoice: Invoice = {
    id: "i",
    company: "c",
    issued: "2025-01-02",
    due: "2025-01-25",
    paid: "2025-02-12",
    amount: 50,
    status: "paid",
    counterparty: "x",
  };
  const jan = rawAt("c", months().indexOf("2025-01"), map, [invoice]);
  const feb = rawAt("c", months().indexOf("2025-02"), map, [invoice]);
  assert.equal(jan.overdue, 1);
  assert.equal(feb.overdue, 0);
  assert.equal(feb.flow.observed, false);
});

test("frozen split is disjoint and later events do not change an earlier score", () => {
  const groups = ["a", "a", "b", "c", "d", "e", "f"];
  const split = groupSplit(groups);
  assert.equal(new Set(split.train).size + new Set(split.validation).size, new Set(groups).size);
  assert.ok(split.train.every((g) => !split.validation.includes(g)));
  assert.deepEqual(split, groupSplit([...groups].reverse()));

  const jan = emptyFlow("c", "2025-01");
  jan.observed = true;
  jan.received = 100;
  jan.spent = 20;
  jan.classified = 120;
  const later = emptyFlow("c", "2025-02");
  later.observed = true;
  later.received = 5;
  later.spent = 300;
  later.classified = 305;
  const params = fit(
    [rawAt("c", months().indexOf("2025-01"), new Map([[jan.month, jan]]), [])],
    groups,
    "fixture",
  );
  const before = scoreCompany("c", new Map([[jan.month, jan]]), [], params);
  const after = scoreCompany(
    "c",
    new Map([
      [jan.month, jan],
      [later.month, later],
    ]),
    [],
    params,
  );
  const i = months().indexOf("2025-01");
  assert.equal(before[i].score, after[i].score);
  assert.equal(before[i].recommendedLimit, after[i].recommendedLimit);
  assert.equal(before[i].action, after[i].action);
});
