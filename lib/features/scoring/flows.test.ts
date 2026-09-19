import assert from "node:assert/strict";
import test from "node:test";
import { emptyFlow, groupFlows, monthlyFlows, pctClasificado } from "@/lib/features/scoring/flows";
import type { Flow, Product, Tx } from "@/lib/features/scoring/types";

const products = new Map<string, Product>([
  ["cash", { company: "c", type: "checking", currency: "EUR", service: "" }],
  ["credit", { company: "c", type: "lineofcredit", currency: "EUR", service: "" }],
  ["card", { company: "c", type: "card", currency: "EUR", service: "" }],
]);
function tx(
  id: string,
  product: string,
  amount: number | null,
  category: string,
  counterparty = "",
): Tx {
  return {
    id,
    company: "c",
    product,
    date: "2025-01-10",
    month: "2025-01",
    amount,
    category,
    counterparty,
  };
}

const txs = [
  tx("1", "cash", 100, "collection", "cp1"),
  tx("2", "cash", -20, "payment", "cp2"),
  tx("3", "cash", -30, "salary"),
  tx("4", "cash", -5, "debt_repayment"),
  tx("5", "cash", -1, "interest_charge"),
  tx("6", "cash", -7, "collection_refund"),
  tx("7", "cash", 40, "payment_refund"),
  tx("8", "cash", 60, "unknown"),
  tx("9", "credit", 500, "collection"),
  tx("10", "credit", -200, "payment"),
  tx("11", "cash", 80, "debt_drawdown"),
  tx("12", "cash", -9, "balance_adjustment"),
  tx("13", "card", -3, "payment"),
  tx("14", "cash", null, "collection"),
  tx("15", "cash", -100, "transfer"),
  tx("16", "cash", 100, "payment"),
  tx("17", "cash", 25, "collection", "cp1"),
];
const mirrors = new Map<string, "interno" | "intragrupo">([
  ["15", "interno"],
  ["16", "intragrupo"],
]);

test("classifies every movement into exactly one bucket", () => {
  const f = monthlyFlows("c", txs, products, mirrors, true).get("2025-01")!;
  assert.equal(f.observed, true);
  assert.equal(f.cobrosOp, 125);
  assert.equal(f.pagosOp, 50);
  assert.equal(f.servicioDeuda, 6);
  assert.equal(f.recibosDevueltos, 7);
  assert.equal(f.dispCredito, 500); // con línea, el debt_drawdown de la cuenta no se duplica
  assert.equal(f.amortCredito, 200);
  assert.equal(f.neutral, 229); // 40 + 9 + 100 (interno) + 80 (debt_drawdown ya en la línea)
  assert.equal(f.intragrupoIn, 100);
  assert.equal(f.sinClasificar, 60);
  assert.equal(f.excluido, 3); // card
  assert.equal(f.nSinImporte, 1); // amount null
  assert.equal(f.nMov, 17);
  assert.deepEqual(f.obligaciones, { tax: 0, social_security: 0, salary: 30, debt_repayment: 5 });
  assert.equal(f.cobrosPorContraparte.cp1, 125);
  assert.equal(f.pagosPorContraparte.cp2, 20);
  assert.equal(f.clasificado, 125 + 50 + 6 + 7 + 500 + 200);
});

test("without a credit line the drawdown on the operating account is the only trace", () => {
  const f = monthlyFlows("c", txs, products, mirrors, false).get("2025-01")!;
  assert.equal(f.dispCredito, 580);
  assert.equal(f.neutral, 149);
  assert.equal(f.clasificado, 125 + 50 + 6 + 7 + 580 + 200);
});

test("a month with only unknown or excluded movements is not observed", () => {
  const solo = (t: Tx[]) => monthlyFlows("c", t, products, new Map(), false).get("2025-01")!;
  assert.equal(solo([tx("1", "cash", 10, "unknown")]).observed, false);
  assert.equal(solo([tx("1", "card", -10, "payment")]).observed, false);
  assert.equal(solo([tx("1", "cash", 10, "payment_refund")]).observed, false);
  assert.equal(solo([tx("1", "credit", 10, "-")]).observed, true);
});

test("group flows sum operating flows per month and count companies once", () => {
  const a = monthlyFlows("a", [tx("1", "cash", 100, "collection")], products, new Map(), false);
  const b = monthlyFlows("b", [tx("2", "cash", -40, "payment")], products, new Map(), false);
  const g = groupFlows([a, b]).get("2025-01")!;
  assert.equal(g.cobrosOp, 100);
  assert.equal(g.pagosOp, 40);
  assert.equal(g.nEmpresas, 2);
  const same = monthlyFlows("a", [tx("3", "cash", 10, "collection")], products, new Map(), false);
  assert.equal(groupFlows([a, same]).get("2025-01")!.nEmpresas, 1);
});

test("pctClasificado weights amounts and rows, and never punishes an empty window", () => {
  const flow = (patch: Partial<Flow>): Flow => ({ ...emptyFlow("c", "2025-01"), ...patch });
  assert.equal(pctClasificado([undefined, undefined]), 1);
  assert.equal(pctClasificado([flow({})]), 1); // 0 movimientos
  assert.equal(pctClasificado([flow({ nMov: 1, excluido: 100 })]), 0); // todo excluido
  assert.equal(pctClasificado([flow({ nMov: 2, intragrupoIn: 100, intragrupoOut: 100 })]), 1);
  assert.equal(pctClasificado([flow({ nMov: 2, clasificado: 100, nSinImporte: 1 })]), 0.5);
  assert.equal(pctClasificado([flow({ nMov: 1, clasificado: 75, neutral: 25 })]), 0.75);
});
