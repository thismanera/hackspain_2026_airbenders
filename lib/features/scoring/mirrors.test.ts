import assert from "node:assert/strict";
import test from "node:test";
import { operatingOnly, pairMirrors } from "@/lib/features/scoring/mirrors";
import type { Product, Tx } from "@/lib/features/scoring/types";

function tx(id: string, company: string, amount: number | null, category = "transfer", date = "2025-01-10"): Tx {
  return { id, company, product: `p-${company}`, date, month: date.slice(0, 7), amount, category, counterparty: "" };
}
const product = (company: string, type: string): [string, Product] => [
  `p-${company}`,
  { company, type, currency: "EUR", service: "" },
];

test("pairs internal first, then intra-group, across any category, one to one", () => {
  const m = pairMirrors([
    tx("a1", "A", -100),
    tx("a2", "A", 100),
    tx("a3", "A", -100, "payment"),
    tx("b1", "B", 100, "collection"),
    tx("b2", "B", 100, "collection"),
    tx("c1", "C", -100, "-", "2025-01-11"),
  ]);
  assert.equal(m.get("a1"), "interno");
  assert.equal(m.get("a2"), "interno");
  assert.equal(m.get("a3"), "intragrupo");
  assert.equal(m.get("b1"), "intragrupo");
  assert.equal(m.has("b2"), false); // sin pareja: uno a uno
  assert.equal(m.has("c1"), false); // otra fecha
});

test("ignores unconvertible amounts, zeros and near misses", () => {
  assert.equal(pairMirrors([tx("x", "A", null), tx("y", "B", 100), tx("z", "B", -100.01)]).size, 0);
  assert.equal(pairMirrors([tx("x", "A", 0), tx("y", "A", 0)]).size, 0);
});

test("ties break by id, not by input order", () => {
  const m = pairMirrors([tx("p1", "A", 100), tx("n2", "A", -100), tx("n1", "A", -100)]);
  assert.equal(m.get("p1"), "interno");
  assert.equal(m.get("n1"), "interno");
  assert.equal(m.has("n2"), false);
});

test("operatingOnly keeps mirrors off credit lines, cards and unknown products", () => {
  const products = new Map<string, Product>([
    product("A", "checking"),
    product("B", "lineofcredit"),
    product("C", "card"),
  ]);
  const txs = [tx("a1", "A", 100), tx("b1", "B", -100), tx("c1", "C", -100), tx("d1", "D", -100)];
  assert.deepEqual(
    operatingOnly(txs, products).map((t) => t.id),
    ["a1"],
  );
  assert.equal(pairMirrors(txs, products).size, 0);
  assert.equal(pairMirrors(txs).size, 2); // sin el filtro, la disposición se comería el cobro
});
