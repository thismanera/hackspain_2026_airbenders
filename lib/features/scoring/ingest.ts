import { createReadStream } from "node:fs";
import { appendFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse } from "csv-parse";
import { z } from "zod";
import { buildFxTable, toEur, type FxObservation, type FxTable } from "@/lib/features/scoring/fx";
import { PARAMS } from "@/lib/features/scoring/params";
import type { Company, Invoice, Product, Tx } from "@/lib/features/scoring/types";

const num = z.preprocess((v) => (v === "" || v === undefined ? null : Number(v)), z.number().finite().nullable());
const companySchema = z.object({ company_id: z.string().min(1), group_id: z.string().default(""), currency: z.string().default("EUR") });
const productSchema = z.object({ product_id: z.string().min(1), company_id: z.string().min(1), type: z.string(), currency: z.string(), service: z.string().default("") });
const scheduleSchema = z.object({
  product_id: z.string(), company_id: z.string().min(1), amortising_frequency: z.string(),
  granted_balance: num, outstanding_balance: num, total_periods: num, annual_interest_rate_or_spread: num,
});
const txSchema = z.object({
  transaction_id: z.string().min(1), company_id: z.string().min(1), product_id: z.string().min(1), date: z.string(),
  amount: z.coerce.number().finite(), exchange_rate: num, status: z.string(), accounting_status: z.string(), category: z.string(), counterparty_id: z.string(),
});
const invoiceSchema = z.object({
  operation_id: z.string().min(1), company_id: z.string().min(1), document_type: z.string(), issuance_date: z.string(), due_date: z.string(),
  payment_date: z.string(), amount: z.coerce.number().finite(), currency: z.string(), accounting_currency: z.string(), exchange_rate: num, status: z.string(), counterparty_id: z.string(),
});
const categorySchema = z.object({ transaction_id: z.string(), normalized_category: z.string(), category_confidence: z.coerce.number() });

export type Meta = {
  companies: Company[];
  products: Record<string, Product>;
  schedule: Record<string, number>;
  fx: FxTable;
  fingerprint: string;
  diagnostics: Record<string, number>;
};

export function partFile(dir: string, group: string, kind: "tx" | "invoice"): string {
  return path.join(dir, "parts", `${kind}-${encodeURIComponent(group)}.jsonl`);
}

export async function* csv(file: string, required: string[]): AsyncGenerator<Record<string, string>> {
  const parser = createReadStream(file).pipe(parse({ columns: true, bom: true, skip_empty_lines: true }));
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

export async function fingerprint(dataset: string, categories: string | null): Promise<string> {
  const hash = createHash("sha256");
  const files = ["companies.csv", "banking_products.csv", "debt_products.csv", "debt_schedule_config.csv", "transactions.csv", "invoices.csv"].map((n) => path.join(dataset, n));
  if (categories) files.push(categories);
  for (const f of files) {
    const s = await stat(f);
    hash.update(`${path.basename(f)}:${s.size}:${s.mtimeMs};`);
  }
  return hash.digest("hex");
}

async function loadCategories(file: string | null): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!file) return out;
  for await (const row of csv(file, ["transaction_id", "normalized_category", "category_confidence"])) {
    const c = categorySchema.parse(row);
    if (c.category_confidence >= PARAMS.categoryConfidenceMin && c.normalized_category && c.normalized_category !== "unknown")
      out.set(c.transaction_id, c.normalized_category);
  }
  return out;
}

export async function ingest(dataset: string, dir: string, categoriesCsv: string | null = null): Promise<Meta> {
  await rm(path.join(dir, "parts"), { recursive: true, force: true });
  await mkdir(path.join(dir, "parts"), { recursive: true });
  const diagnostics: Record<string, number> = {};
  const count = (k: string) => (diagnostics[k] = (diagnostics[k] ?? 0) + 1);

  const companies: Company[] = [], groupOf = new Map<string, string>(), currencyOf = new Map<string, string>();
  for await (const row of csv(path.join(dataset, "companies.csv"), ["company_id", "group_id", "currency"])) {
    const c = companySchema.parse(row);
    if (groupOf.has(c.company_id)) throw new Error(`duplicate company ${c.company_id}`);
    const groupId = c.group_id || c.company_id;
    companies.push({ id: c.company_id, groupId, currency: c.currency || "EUR" });
    groupOf.set(c.company_id, groupId);
    currencyOf.set(c.company_id, c.currency || "EUR");
  }
  const products: Record<string, Product> = {};
  for (const name of ["banking_products.csv", "debt_products.csv"])
    for await (const row of csv(path.join(dataset, name), ["product_id", "company_id", "type", "currency"])) {
      const p = productSchema.parse(row);
      if (!groupOf.has(p.company_id)) throw new Error(`unknown company on product ${p.product_id}`);
      products[p.product_id] = { company: p.company_id, type: p.type, currency: p.currency, service: p.service };
    }
  const schedule: Record<string, number> = {};
  for await (const row of csv(path.join(dataset, "debt_schedule_config.csv"), ["product_id", "company_id", "amortising_frequency"])) {
    const s = scheduleSchema.parse(row);
    if (s.amortising_frequency !== "monthly" || !s.granted_balance || !s.total_periods) continue;
    const cuota = s.granted_balance / s.total_periods + ((s.outstanding_balance ?? 0) * (s.annual_interest_rate_or_spread ?? 0)) / 12;
    schedule[s.company_id] = (schedule[s.company_id] ?? 0) + cuota;
  }

  // pasada 1: tabla de tasas desde facturas
  const fxRows: FxObservation[] = [];
  for await (const row of csv(path.join(dataset, "invoices.csv"), ["currency", "accounting_currency", "exchange_rate", "issuance_date"])) {
    const rate = Number(row.exchange_rate);
    if (rate > 0 && row.currency !== row.accounting_currency)
      fxRows.push({ currency: row.currency, accounting: row.accounting_currency, rate, month: row.issuance_date.slice(0, 7) });
  }
  const fx = buildFxTable(fxRows);
  const categories = await loadCategories(categoriesCsv);

  const buffers = new Map<string, string[]>();
  let size = 0;
  async function flush() {
    await Promise.all([...buffers].map(async ([file, lines]) => lines.length && appendFile(file, lines.join(""))));
    buffers.clear();
    size = 0;
  }
  async function emit(file: string, item: Tx | Invoice) {
    const list = buffers.get(file) ?? [];
    list.push(JSON.stringify(item) + "\n");
    buffers.set(file, list);
    if (++size >= 100000) await flush();
  }

  for await (const row of csv(path.join(dataset, "transactions.csv"), ["transaction_id", "company_id", "product_id", "date", "amount", "exchange_rate", "status", "accounting_status", "category", "counterparty_id"])) {
    const parsed = txSchema.safeParse(row);
    if (!parsed.success) {
      count("invalid_tx");
      continue;
    }
    const r = parsed.data;
    const group = groupOf.get(r.company_id);
    if (!group) throw new Error(`unknown company on transaction ${r.transaction_id}`);
    if (r.status !== "booked" && !(r.status === "" && /RECONCIL/i.test(r.accounting_status))) {
      count("unbooked_tx");
      continue;
    }
    const month = r.date.slice(0, 7);
    if (month < PARAMS.mesInicio || month > PARAMS.mesFin) {
      count("outside_window_tx");
      continue;
    }
    const product = products[r.product_id];
    let amount: number | null = null;
    if (product) amount = toEur(fx, r.amount, r.exchange_rate, product.currency, currencyOf.get(r.company_id)!, month);
    else count("unknown_product_tx");
    if (product && amount === null) count("unconvertible_tx");
    await emit(partFile(dir, group, "tx"), {
      id: r.transaction_id, company: r.company_id, product: r.product_id, date: r.date.slice(0, 10), month, amount,
      category: categories.get(r.transaction_id) ?? r.category, counterparty: r.counterparty_id,
    });
  }
  for await (const row of csv(path.join(dataset, "invoices.csv"), ["operation_id", "company_id", "document_type", "issuance_date", "due_date", "payment_date", "amount", "currency", "accounting_currency", "exchange_rate", "status", "counterparty_id"])) {
    const parsed = invoiceSchema.safeParse(row);
    if (!parsed.success) {
      count("invalid_invoice");
      continue;
    }
    const r = parsed.data;
    const group = groupOf.get(r.company_id);
    if (!group) throw new Error(`unknown company on invoice ${r.operation_id}`);
    if (r.document_type !== "invoice" || r.status === "cancel") {
      count("excluded_document");
      continue;
    }
    if (!r.issuance_date || !r.due_date || r.issuance_date.slice(0, 7) > PARAMS.mesFin) {
      count("invalid_invoice_dates");
      continue;
    }
    const month = r.issuance_date.slice(0, 7);
    const amount = toEur(fx, r.amount, r.currency === r.accounting_currency ? 1 : r.exchange_rate, r.currency, r.accounting_currency, month);
    if (amount === null) {
      count("unconvertible_invoice");
      continue;
    }
    await emit(partFile(dir, group, "invoice"), {
      id: r.operation_id, company: r.company_id, issued: r.issuance_date.slice(0, 10), due: r.due_date.slice(0, 10),
      paid: r.payment_date.slice(0, 10), amount, status: r.status, counterparty: r.counterparty_id,
    });
  }
  await flush();
  const meta: Meta = { companies, products, schedule, fx, fingerprint: await fingerprint(dataset, categoriesCsv), diagnostics };
  await writeFile(path.join(dir, "ingest.json"), JSON.stringify(meta));
  return meta;
}

export async function readPartition<T>(dir: string, group: string, kind: "tx" | "invoice"): Promise<T[]> {
  const contents = await readFile(partFile(dir, group, kind), "utf8").catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return "";
    throw e;
  });
  return contents.trim() ? contents.trimEnd().split("\n").map((l) => JSON.parse(l) as T) : [];
}
