import { createReadStream } from "node:fs";
import { appendFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse } from "csv-parse";
import { z } from "zod";
import type { Invoice, Product, Tx } from "@/lib/features/scoring/model";

const companySchema = z.object({
  company_id: z.string().min(1),
  group_id: z.string().optional().default(""),
  currency: z.string().optional().default(""),
});
const productSchema = z.object({
  product_id: z.string().min(1),
  company_id: z.string().min(1),
  type: z.string(),
  currency: z.string(),
});
const txSchema = z.object({
  transaction_id: z.string().min(1),
  company_id: z.string().min(1),
  product_id: z.string().min(1),
  date: z.string(),
  amount: z.coerce.number().finite(),
  category: z.string(),
  status: z.string(),
  accounting_status: z.string(),
  counterparty_id: z.string(),
});
const invoiceSchema = z.object({
  operation_id: z.string().min(1),
  company_id: z.string().min(1),
  document_type: z.string(),
  issuance_date: z.string(),
  due_date: z.string(),
  payment_date: z.string(),
  amount: z.coerce.number().finite(),
  currency: z.string(),
  status: z.string(),
  counterparty_id: z.string(),
});
export type Company = { id: string; groupId: string; currency: string };
export type Meta = {
  companies: Company[];
  products: Record<string, Product>;
  fingerprint: string;
  diagnostics: Record<string, number>;
};
function fileFor(dir: string, company: string, kind: "tx" | "invoice"): string {
  return path.join(dir, "parts", `${kind}-${encodeURIComponent(company)}.jsonl`);
}
export async function* csv(
  file: string,
  required: string[],
): AsyncGenerator<Record<string, string>> {
  const parser = createReadStream(file).pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true, relax_quotes: false }),
  );
  let checked = false;
  for await (const row of parser) {
    if (!checked) {
      const missing = required.filter((x) => !(x in row));
      if (missing.length) throw new Error(`${file}: missing ${missing.join(", ")}`);
      checked = true;
    }
    yield row as Record<string, string>;
  }
  if (!checked) throw new Error(`${file}: empty CSV`);
}
export async function fingerprint(dataset: string): Promise<string> {
  const hash = createHash("sha256");
  for (const name of [
    "companies.csv",
    "banking_products.csv",
    "debt_products.csv",
    "transactions.csv",
    "invoices.csv",
  ]) {
    const s = await stat(path.join(dataset, name));
    hash.update(`${name}:${s.size}:${s.mtimeMs};`);
  }
  return hash.digest("hex");
}
export async function ingest(dataset: string, dir: string): Promise<Meta> {
  await rm(path.join(dir, "parts"), { recursive: true, force: true });
  await mkdir(path.join(dir, "parts"), { recursive: true });
  const companies: Company[] = [],
    products: Record<string, Product> = {},
    diagnostics: Record<string, number> = {};
  const count = (name: string) => {
    diagnostics[name] = (diagnostics[name] ?? 0) + 1;
  };
  const companyIds = new Set<string>();
  for await (const row of csv(path.join(dataset, "companies.csv"), [
    "company_id",
    "group_id",
    "currency",
  ])) {
    const c = companySchema.parse(row);
    if (companyIds.has(c.company_id)) throw new Error(`duplicate company ${c.company_id}`);
    companyIds.add(c.company_id);
    companies.push({ id: c.company_id, groupId: c.group_id || c.company_id, currency: c.currency });
  }
  for (const name of ["banking_products.csv", "debt_products.csv"])
    for await (const row of csv(path.join(dataset, name), [
      "product_id",
      "company_id",
      "type",
      "currency",
    ])) {
      const p = productSchema.parse(row);
      if (!companyIds.has(p.company_id))
        throw new Error(`unknown company on product ${p.product_id}`);
      if (products[p.product_id]) throw new Error(`duplicate product ${p.product_id}`);
      products[p.product_id] = { company: p.company_id, type: p.type, currency: p.currency };
    }
  async function partition(
    kind: "tx" | "invoice",
    rows: AsyncGenerator<Record<string, string>>,
  ): Promise<void> {
    const buffers = new Map<string, string[]>();
    let size = 0;
    async function flush() {
      await Promise.all(
        [...buffers].map(async ([company, lines]) => {
          if (lines.length) await appendFile(fileFor(dir, company, kind), lines.join(""));
        }),
      );
      buffers.clear();
      size = 0;
    }
    for await (const row of rows) {
      let item: Tx | Invoice | null = null;
      if (kind === "tx") {
        const parsed = txSchema.safeParse(row);
        if (!parsed.success) {
          count("invalid_tx");
          continue;
        }
        const r = parsed.data;
        const product = products[r.product_id];
        if (!companyIds.has(r.company_id) || (product && product.company !== r.company_id))
          throw new Error(`conflicting transaction ${r.transaction_id}`);
        if (!product) {
          count("unknown_product_tx");
        }
        if (product && product.currency !== "EUR") {
          count("non_eur_tx");
        }
        if (r.status !== "booked" && !(r.status === "" && /RECONCIL/i.test(r.accounting_status))) {
          count("unbooked_tx");
          continue;
        }
        const month = r.date.slice(0, 7);
        if (month < "2024-09" || month > "2026-08") {
          count("outside_window_tx");
          continue;
        }
        item = {
          id: r.transaction_id,
          company: r.company_id,
          product: r.product_id,
          date: r.date.slice(0, 10),
          month,
          amount: r.amount,
          category: r.category,
          counterparty: r.counterparty_id,
        };
      } else {
        const parsed = invoiceSchema.safeParse(row);
        if (!parsed.success) {
          count("invalid_invoice");
          continue;
        }
        const r = parsed.data;
        if (!companyIds.has(r.company_id))
          throw new Error(`unknown company on invoice ${r.operation_id}`);
        if (r.document_type !== "invoice" || r.status === "cancel") {
          count("excluded_document");
          continue;
        }
        if (r.currency !== "EUR") {
          count("non_eur_invoice");
          continue;
        }
        if (!r.issuance_date || !r.due_date || r.issuance_date.slice(0, 7) > "2026-08") {
          count("invalid_invoice_dates");
          continue;
        }
        item = {
          id: r.operation_id,
          company: r.company_id,
          issued: r.issuance_date.slice(0, 10),
          due: r.due_date.slice(0, 10),
          paid: r.payment_date.slice(0, 10),
          amount: r.amount,
          status: r.status,
          counterparty: r.counterparty_id,
        };
      }
      const list = buffers.get(item.company) ?? [];
      list.push(JSON.stringify(item) + "\n");
      buffers.set(item.company, list);
      size++;
      if (size >= 100000) await flush();
    }
    await flush();
  }
  await partition(
    "tx",
    csv(path.join(dataset, "transactions.csv"), [
      "transaction_id",
      "company_id",
      "product_id",
      "date",
      "amount",
      "status",
      "accounting_status",
      "category",
      "counterparty_id",
    ]),
  );
  await partition(
    "invoice",
    csv(path.join(dataset, "invoices.csv"), [
      "operation_id",
      "company_id",
      "document_type",
      "issuance_date",
      "due_date",
      "payment_date",
      "amount",
      "currency",
      "status",
      "counterparty_id",
    ]),
  );
  const meta = { companies, products, fingerprint: await fingerprint(dataset), diagnostics };
  await writeFile(path.join(dir, "ingest.json"), JSON.stringify(meta));
  return meta;
}
export async function readPartition<T>(
  dir: string,
  company: string,
  kind: "tx" | "invoice",
): Promise<T[]> {
  const contents = await readFile(fileFor(dir, company, kind), "utf8").catch(
    (e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return "";
      throw e;
    },
  );
  return contents.trim()
    ? contents
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line) as T)
    : [];
}
