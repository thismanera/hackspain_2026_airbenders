import assert from "node:assert/strict";
import test from "node:test";
import { pairMirrors } from "@/lib/features/scoring/mirrors";
import type { Tx } from "@/lib/features/scoring/types";

function tx(id: string, company: string, amount: number | null, category = "transfer", date = "2025-01-10"): Tx {
  return { id, company, product: `p-${company}`, date, month: date.slice(0, 7), amount, category, counterparty: "" };
}

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

test("ignores unconvertible amounts and near misses", () => {
  const m = pairMirrors([tx("x", "A", null), tx("y", "B", 100), tx("z", "B", -100.01)]);
  assert.equal(m.size, 0);
});
