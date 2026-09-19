import assert from "node:assert/strict";
import test from "node:test";

import { bankComparison } from "./bank-comparison";
import { buildPortfolio } from "./fixtures";

const companies = buildPortfolio();
const decisions = [...companies.values()].flatMap((c) => c.months.map((m) => m.decision));

test("sin línea vigente no hay comparativa (nada de defaults inventados)", () => {
  const closed = decisions.find((d) => !d.eligible);
  assert.ok(closed);
  assert.equal(bankComparison(closed), null);
  const open = decisions.find((d) => d.eligible && d.limit > 0);
  assert.ok(open);
  assert.equal(bankComparison({ ...open, limit: 0 }), null);
});

test("la comparativa sale del límite y la TAE reales y puede ser negativa", () => {
  const open = decisions.find((d) => d.eligible && d.limit > 0);
  assert.ok(open);
  const cheap = bankComparison({ ...open, limit: 100_000, apr: 4.5 });
  assert.ok(cheap);
  assert.equal(cheap.embatInterest, 4_500);
  assert.equal(cheap.bankInterest, 8_200);
  assert.equal(cheap.openingFee, 600);
  assert.equal(cheap.savings, 4_300);
  assert.equal(cheap.aprGap, 3.7);

  const expensive = bankComparison({ ...open, limit: 100_000, apr: 10 });
  assert.ok(expensive);
  assert.equal(expensive.savings, -1_200);
  assert.equal(expensive.aprGap, -1.8);
});
