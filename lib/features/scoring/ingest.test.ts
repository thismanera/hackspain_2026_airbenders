import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ingest, readPartition } from "@/lib/features/scoring/ingest";
import type { Invoice, Tx } from "@/lib/features/scoring/types";

type Overrides = {
  schedule?: string | null;
  transactions?: string[];
  invoices?: string[];
  categories?: string;
};

const TX_HEADER =
  "transaction_id,company_id,product_id,date,value_date,amount,exchange_rate,status,accounting_status,category,description,counterparty_id";
const INVOICE_HEADER =
  "operation_id,company_id,document_type,issuance_date,due_date,payment_date,amount,pending_amount,currency,accounting_currency,exchange_rate,status,concept,counterparty_id";
const SCHEDULE_HEADER =
  "product_id,company_id,settlement_product_id,currency,amortization_type,interest_calc_method,amortising_frequency,granted_balance,outstanding_balance,total_periods,next_payment_date,last_payment_date,annual_interest_rate_or_spread,interest_type";

const TXS = [
  "t1,A,pa,2025-03-05 00:00:00,2025-03-05,100,1,booked,,collection,,c1",
  "t2,A,pu,2025-03-06 00:00:00,2025-03-06,116,1.16,booked,,-,,",
  "t3,B,pb,2025-03-07 00:00:00,2025-03-07,100,1,booked,,payment,,",
  "t4,A,pa,2025-03-08 00:00:00,2025-03-08,-5,1,pending,,fee,,",
  "t5,A,pa,2023-01-08 00:00:00,2023-01-08,-5,1,booked,,fee,,",
  "t6,A,pa,2025-03-09 00:00:00,2025-03-09,50,1.16,booked,,collection,,c1",
  "t7,A,pa,2025-03-10 00:00:00,2025-03-10,-5,1,,RECONCILED,fee,,",
];
// Tres facturas USD/EUR del mismo mes: el mínimo para que la tabla acepte la mediana (§3.2).
const INVOICES = [
  "i1,A,invoice,2025-03-01 00:00:00,2025-03-31 00:00:00,2025-03-31 00:00:00,232,0,USD,EUR,1.16,paid,,c1",
  "i2,A,invoice,2025-03-01 00:00:00,2025-03-31 00:00:00,,-50,50,EUR,EUR,1,pending,,c2",
  "i3,A,note,2025-03-01 00:00:00,2025-03-31 00:00:00,,-50,50,EUR,EUR,1,paid,,c2",
  "i4,A,invoice,2025-03-02 00:00:00,2025-03-31 00:00:00,,116,116,USD,EUR,1.16,overdue,,c1",
  "i5,A,invoice,2025-03-03 00:00:00,2025-03-31 00:00:00,,116,116,USD,EUR,1.16,payment_in_progress,,c1",
  "i6,A,invoice,2025-03-04 00:00:00,2025-03-31 00:00:00,,-70,70,EUR,EUR,1,cancel,,c2",
];

async function dataset(
  o: Overrides = {},
): Promise<{ dataset: string; out: string; categories: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "ingest-"));
  const w = (name: string, body: string) => writeFile(path.join(dir, name), body);
  await w(
    "companies.csv",
    "company_id,group_id,country,currency,erp,created_at\nA,G,ES,EUR,,\nB,G,,USD,,\n",
  );
  await w(
    "banking_products.csv",
    "product_id,company_id,label,type,bank_name,service,currency,created_at\npa,A,,checking,,,EUR,\npb,B,,checking,,,USD,\npu,A,,checking,,,USD,\npz,ZZZ,,checking,,,EUR,\n",
  );
  await w(
    "debt_products.csv",
    "product_id,company_id,label,type,bank_name,service,currency,created_at,granted,outstanding,liquidity\nla,A,LOAN_01,loan,Other (customer-defined),custom,EUR,,-1000,-500,\n",
  );
  if (o.schedule !== null)
    await w(
      "debt_schedule_config.csv",
      o.schedule ??
        `${SCHEDULE_HEADER}\nla,A,pa,EUR,constant quote,30/360,monthly,1200,600,12,,,0.06,fixed\n`,
    );
  await w("transactions.csv", [TX_HEADER, ...(o.transactions ?? TXS), ""].join("\n"));
  await w("invoices.csv", [INVOICE_HEADER, ...(o.invoices ?? INVOICES), ""].join("\n"));
  const categories = path.join(dir, "categories.csv");
  await writeFile(
    categories,
    o.categories ??
      "transaction_id,normalized_category,category_confidence\nt2,collection,0.97\nt3,collection,0.5\n",
  );
  return { dataset: dir, out: path.join(dir, "out"), categories };
}

test("ingest partitions by group, converts to EUR and applies confident categories", async () => {
  const d = await dataset();
  const meta = await ingest(d.dataset, d.out, d.categories);
  assert.deepEqual(
    meta.companies.map((c) => c.id),
    ["A", "B"],
  );
  assert.equal(meta.schedule.A, 1200 / 12 + (600 * 0.06) / 12);
  const txs = await readPartition<Tx>(d.out, "G", "tx");
  const by = Object.fromEntries(txs.map((t) => [t.id, t]));
  assert.equal(txs.length, 4); // t4 pending, t5 fuera de ventana y t7 no booked quedan fuera
  assert.equal(by.t1.amount, 100);
  assert.ok(Math.abs(by.t2.amount! - 100) < 1e-9); // 116 USD / 1.16 → 100 EUR
  assert.equal(by.t2.category, "collection"); // reclasificada con 0.97
  assert.equal(by.t3.category, "payment"); // 0.5 < 0.95: se conserva la original
  assert.ok(Math.abs(by.t3.amount! - 100 / 1.16) < 1e-6); // empresa USD → EUR con la tabla de facturas
  assert.equal(by.t6.amount, 50); // misma moneda que la empresa: se ignora el exchange_rate del CSV
  const inv = await readPartition<Invoice>(d.out, "G", "invoice");
  assert.deepEqual(
    inv.map((i) => i.id),
    ["i1", "i2", "i4", "i5"],
  ); // note y cancel fuera
  assert.ok(Math.abs(inv.find((i) => i.id === "i1")!.amount - 200) < 1e-9);
  assert.equal(meta.diagnostics.unbooked_tx, 2);
  assert.equal(meta.diagnostics.excluded_document, 2);
  assert.equal(meta.diagnostics.orphan_product, 1); // pz, empresa desconocida
  await rm(d.dataset, { recursive: true, force: true });
});

test("partitions are keyed by group, not by company", async () => {
  const d = await dataset();
  await ingest(d.dataset, d.out, d.categories);
  assert.ok((await readPartition<Tx>(d.out, "G", "tx")).length > 0);
  assert.deepEqual(await readPartition<Tx>(d.out, "A", "tx"), []);
  assert.deepEqual(await readPartition<Invoice>(d.out, "B", "invoice"), []);
  await rm(d.dataset, { recursive: true, force: true });
});

test("the new rule-based categories are accepted at 0.90 confidence", async () => {
  const d = await dataset({
    categories: [
      "transaction_id,normalized_category,category_confidence",
      "t1,debt_drawdown,0.9",
      "t2,balance_adjustment,0.9",
      "t3,collection,0.9",
      "",
    ].join("\n"),
  });
  await ingest(d.dataset, d.out, d.categories);
  const by = Object.fromEntries((await readPartition<Tx>(d.out, "G", "tx")).map((t) => [t.id, t]));
  assert.equal(by.t1.category, "debt_drawdown");
  assert.equal(by.t2.category, "balance_adjustment");
  assert.equal(by.t3.category, "payment"); // 0.90 < 0.95 para una categoría normal
  await rm(d.dataset, { recursive: true, force: true });
});

test("orphan rows are counted, never fatal", async () => {
  const d = await dataset({
    transactions: [...TXS, "t8,ZZZ,pa,2025-03-05 00:00:00,2025-03-05,10,1,booked,,collection,,c1"],
    invoices: [
      ...INVOICES,
      "i7,ZZZ,invoice,2025-03-01 00:00:00,2025-03-31 00:00:00,,10,0,EUR,EUR,1,paid,,c1",
    ],
  });
  const meta = await ingest(d.dataset, d.out, d.categories);
  assert.equal(meta.diagnostics.orphan_tx, 1);
  assert.equal(meta.diagnostics.orphan_invoice, 1);
  assert.equal(meta.diagnostics.orphan_product, 1);
  await rm(d.dataset, { recursive: true, force: true });
});

test("a missing or header-only debt schedule just means no instalments", async () => {
  const sin = await dataset({ schedule: null });
  const metaSin = await ingest(sin.dataset, sin.out, sin.categories);
  assert.deepEqual(metaSin.schedule, {});
  assert.equal(metaSin.fingerprint.length, 64);
  await rm(sin.dataset, { recursive: true, force: true });

  const vacio = await dataset({ schedule: `${SCHEDULE_HEADER}\n` });
  const metaVacio = await ingest(vacio.dataset, vacio.out, vacio.categories);
  assert.deepEqual(metaVacio.schedule, {});
  assert.notEqual(metaVacio.fingerprint, metaSin.fingerprint);
  await rm(vacio.dataset, { recursive: true, force: true });
});

test("a zero granted balance still contributes the interest term", async () => {
  const d = await dataset({
    schedule: `${SCHEDULE_HEADER}\nla,A,pa,EUR,constant quote,30/360,monthly,0,600,12,,,0.06,fixed\n`,
  });
  const meta = await ingest(d.dataset, d.out, d.categories);
  assert.ok(Math.abs(meta.schedule.A - (600 * 0.06) / 12) < 1e-9);
  await rm(d.dataset, { recursive: true, force: true });
});

test("a schedule row in another currency is converted to EUR with the fx table", async () => {
  // Tres facturas USD/EUR en `mesFin` con tasa 2: la tabla acepta la mediana 0,5 € por USD (§3.2).
  const usd = [1, 2, 3].map(
    (n) => `u${n},A,invoice,2026-08-0${n} 00:00:00,2026-08-31 00:00:00,,200,200,USD,EUR,2,paid,,c1`,
  );
  const d = await dataset({
    invoices: [...INVOICES, ...usd],
    schedule: `${SCHEDULE_HEADER}\nla,A,pa,USD,constant quote,30/360,monthly,1200,600,12,,,0.06,fixed\n`,
  });
  const meta = await ingest(d.dataset, d.out, d.categories);
  assert.ok(Math.abs(meta.schedule.A - (1200 / 12 + (600 * 0.06) / 12) * 0.5) < 1e-9);
  await rm(d.dataset, { recursive: true, force: true });
});
