import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ingest, readPartition } from "@/lib/features/scoring/ingest";
import type { Invoice, Tx } from "@/lib/features/scoring/types";

async function dataset(): Promise<{ dataset: string; out: string; categories: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "ingest-"));
  const w = (name: string, body: string) => writeFile(path.join(dir, name), body);
  await w("companies.csv", "company_id,group_id,country,currency,erp,created_at\nA,G,ES,EUR,,\nB,G,,USD,,\n");
  await w("banking_products.csv", "product_id,company_id,label,type,bank_name,service,currency,created_at\npa,A,,checking,,,EUR,\npb,B,,checking,,,USD,\npu,A,,checking,,,USD,\n");
  await w("debt_products.csv", "product_id,company_id,label,type,bank_name,service,currency,created_at,granted,outstanding,liquidity\nla,A,LOAN_01,loan,Other (customer-defined),custom,EUR,,-1000,-500,\n");
  await w("debt_schedule_config.csv", "product_id,company_id,settlement_product_id,currency,amortization_type,interest_calc_method,amortising_frequency,granted_balance,outstanding_balance,total_periods,next_payment_date,last_payment_date,annual_interest_rate_or_spread,interest_type\nla,A,pa,EUR,constant quote,30/360,monthly,1200,600,12,,,0.06,fixed\n");
  await w("transactions.csv", [
    "transaction_id,company_id,product_id,date,value_date,amount,exchange_rate,status,accounting_status,category,description,counterparty_id",
    "t1,A,pa,2025-03-05 00:00:00,2025-03-05,100,1,booked,,collection,,c1",
    "t2,A,pu,2025-03-06 00:00:00,2025-03-06,116,1.16,booked,,-,,",
    "t3,B,pb,2025-03-07 00:00:00,2025-03-07,100,1,booked,,payment,,",
    "t4,A,pa,2025-03-08 00:00:00,2025-03-08,-5,1,pending,,fee,,",
    "t5,A,pa,2023-01-08 00:00:00,2023-01-08,-5,1,booked,,fee,,",
    "",
  ].join("\n"));
  await w("invoices.csv", [
    "operation_id,company_id,document_type,issuance_date,due_date,payment_date,amount,pending_amount,currency,accounting_currency,exchange_rate,status,concept,counterparty_id",
    "i1,A,invoice,2025-03-01 00:00:00,2025-03-31 00:00:00,2025-03-31 00:00:00,232,0,USD,EUR,1.16,paid,,c1",
    "i2,A,invoice,2025-03-01 00:00:00,2025-03-31 00:00:00,,-50,50,EUR,EUR,1,pending,,c2",
    "i3,A,note,2025-03-01 00:00:00,2025-03-31 00:00:00,,-50,50,EUR,EUR,1,paid,,c2",
    "",
  ].join("\n"));
  const categories = path.join(dir, "categories.csv");
  await writeFile(categories, "transaction_id,normalized_category,category_confidence\nt2,collection,0.97\nt3,collection,0.5\n");
  return { dataset: dir, out: path.join(dir, "out"), categories };
}

test("ingest partitions by group, converts to EUR and applies confident categories", async () => {
  const d = await dataset();
  const meta = await ingest(d.dataset, d.out, d.categories);
  assert.deepEqual(meta.companies.map((c) => c.id), ["A", "B"]);
  assert.equal(meta.schedule.A, 1200 / 12 + (600 * 0.06) / 12);
  const txs = await readPartition<Tx>(d.out, "G", "tx");
  const by = Object.fromEntries(txs.map((t) => [t.id, t]));
  assert.equal(txs.length, 3); // t4 pending y t5 fuera de ventana quedan fuera
  assert.equal(by.t1.amount, 100);
  assert.ok(Math.abs(by.t2.amount! - 100) < 1e-9); // 116 USD / 1.16 → 100 EUR
  assert.equal(by.t2.category, "collection"); // reclasificada con 0.97
  assert.equal(by.t3.category, "payment"); // 0.5 < 0.95: se conserva la original
  assert.ok(Math.abs(by.t3.amount! - 100 / 1.16) < 1e-6); // empresa USD → EUR con la tabla de facturas
  const inv = await readPartition<Invoice>(d.out, "G", "invoice");
  assert.equal(inv.length, 2); // note fuera
  assert.ok(Math.abs(inv.find((i) => i.id === "i1")!.amount - 200) < 1e-9);
  assert.equal(meta.diagnostics.unbooked_tx, 1);
});
