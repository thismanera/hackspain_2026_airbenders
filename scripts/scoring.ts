import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { createInterface } from "node:readline";

import { backtest } from "../lib/features/scoring/backtest";
import { scoreResultSchema } from "../lib/features/scoring/contracts";
import { fit, groupSplit, rawAt, scoreCompany } from "../lib/features/scoring/engine";
import {
  fingerprint,
  ingest,
  readPartition,
  type Company,
  type Meta,
} from "../lib/features/scoring/ingest";
import {
  monthlyFlows,
  months,
  type Flow,
  type Invoice,
  type Parameters,
  type Product,
  type Raw,
  type Result,
  type Tx,
} from "../lib/features/scoring/model";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataset = path.resolve(process.env.SCORING_DATASET ?? path.join(root, "dataset"));
const dir = path.resolve(process.env.SCORING_OUT ?? path.join(root, "tmp", "scoring-v02"));
const command = process.argv[2];
function runDir(params: Parameters, inputFingerprint: string): string {
  return path.join(dir, "runs", params.version, inputFingerprint);
}
function parameterPath(): string {
  return path.resolve(process.env.SCORING_PARAMS ?? path.join(dir, "parameters.json"));
}
async function meta(): Promise<Meta> {
  const m = JSON.parse(await readFile(path.join(dir, "ingest.json"), "utf8")) as Meta;
  if (m.fingerprint !== (await fingerprint(dataset)))
    throw new Error("dataset changed; remove generated artifacts and run fit again");
  return m;
}
async function inputs(c: Company, m: Meta) {
  const tx = await readPartition<Tx>(dir, c.id, "tx"),
    invoices = await readPartition<Invoice>(dir, c.id, "invoice");
  return {
    tx,
    invoices,
    flows: monthlyFlows(c.id, tx, new Map(Object.entries(m.products) as [string, Product][])),
  };
}
async function* lines(file: string): AsyncGenerator<Result> {
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity }))
    if (line) yield JSON.parse(line) as Result;
}
async function put(
  stream: ReturnType<typeof createWriteStream>,
  item: Result | Flow | Raw | (Raw & { company: string; month: string }),
): Promise<void> {
  if (!stream.write(JSON.stringify(item) + "\n")) await once(stream, "drain");
}
async function close(stream: ReturnType<typeof createWriteStream>): Promise<void> {
  stream.end();
  await once(stream, "finish");
}

async function doFit() {
  const m =
    process.env.SCORING_REINGEST === "1"
      ? await ingest(dataset, dir)
      : await meta().catch(() => ingest(dataset, dir));
  const split = groupSplit(m.companies.map((c) => c.groupId));
  const train = new Set(split.train);
  const raws = [];
  let directionAgree = 0,
    directionTotal = 0;
  for (const c of m.companies.filter((c) => train.has(c.groupId))) {
    const input = await inputs(c, m);
    const bank = new Map<string, { received: number; spent: number }>();
    for (const f of input.flows.values()) {
      if (f.month > "2026-02") continue;
      for (const [id, amount] of Object.entries(f.counterpartiesIn)) {
        const b = bank.get(id) ?? { received: 0, spent: 0 };
        b.received += amount;
        bank.set(id, b);
      }
      for (const [id, amount] of Object.entries(f.counterpartiesOut)) {
        const b = bank.get(id) ?? { received: 0, spent: 0 };
        b.spent += amount;
        bank.set(id, b);
      }
    }
    for (const i of input.invoices) {
      if (i.issued > "2026-02-28") continue;
      const b = bank.get(i.counterparty);
      if (!b || i.amount === 0 || b.received === b.spent) continue;
      directionTotal++;
      if ((i.amount > 0 && b.received > b.spent) || (i.amount < 0 && b.spent > b.received))
        directionAgree++;
    }
    for (let t = 0; t < months().length; t++)
      if (months()[t] <= "2026-02") raws.push(rawAt(c.id, t, input.flows, input.invoices));
  }
  const invoiceEnabled = directionTotal > 0 && directionAgree / directionTotal >= 0.8;
  const params = fit(
    raws,
    m.companies.map((c) => c.groupId),
    m.fingerprint,
    invoiceEnabled,
  );
  await writeFile(path.join(dir, "parameters.json"), JSON.stringify(params));
  await mkdir(path.join(dir, "runs", params.version), { recursive: true });
  await writeFile(
    path.join(dir, "runs", params.version, "parameters.json"),
    JSON.stringify(params),
  );
  await writeFile(
    path.join(dir, "fit.json"),
    JSON.stringify({
      rows: raws.length,
      directionAgree,
      directionTotal,
      invoiceEnabled,
      version: params.version,
      diagnostics: m.diagnostics,
    }),
  );
  console.log(JSON.stringify({ rows: raws.length, version: params.version, invoiceEnabled }));
}
async function doScore() {
  const m = await meta().catch(() => ingest(dataset, dir)),
    params = JSON.parse(await readFile(parameterPath(), "utf8")) as Parameters;
  await mkdir(runDir(params, m.fingerprint), { recursive: true });
  const output = createWriteStream(path.join(runDir(params, m.fingerprint), "scores.jsonl"));
  const flowOutput = createWriteStream(path.join(runDir(params, m.fingerprint), "flows.jsonl"));
  const rawOutput = createWriteStream(path.join(runDir(params, m.fingerprint), "indicators.jsonl"));
  let count = 0;
  for (const c of m.companies) {
    const input = await inputs(c, m);
    for (const month of months()) {
      const flow = input.flows.get(month);
      if (flow) await put(flowOutput, flow);
      await put(rawOutput, {
        company: c.id,
        month,
        ...rawAt(c.id, months().indexOf(month), input.flows, input.invoices),
      });
    }
    for (const row of scoreCompany(c.id, input.flows, input.invoices, params)) {
      await put(output, scoreResultSchema.parse(row));
      count++;
    }
  }
  await close(output);
  await close(flowOutput);
  await close(rawOutput);
  const manifest = {
    runId: createHash("sha256")
      .update(`${m.fingerprint}:${params.version}`)
      .digest("hex")
      .slice(0, 24),
    fingerprint: m.fingerprint,
    parameterVersion: params.version,
    rows: count,
    diagnostics: m.diagnostics,
    completedAt: new Date().toISOString(),
  };
  await writeFile(
    path.join(runDir(params, m.fingerprint), "manifest.json"),
    JSON.stringify(manifest),
  );
  console.log(JSON.stringify(manifest));
}
async function doBacktest() {
  const m = await meta(),
    params = JSON.parse(await readFile(parameterPath(), "utf8")) as Parameters;
  const validation = new Set(params.validationGroups),
    companyGroups = new Map(m.companies.map((c) => [c.id, c.groupId]));
  const rows: Result[] = [];
  for await (const row of lines(path.join(runDir(params, m.fingerprint), "scores.jsonl")))
    if (validation.has(companyGroups.get(row.company)!)) rows.push(row);
  const metrics = {
    ...backtest(rows),
    validationCompanies: new Set(rows.map((r) => r.company)).size,
    validationRows: rows.length,
  };
  await writeFile(
    path.join(runDir(params, m.fingerprint), "backtest.json"),
    JSON.stringify(metrics),
  );
  console.log(JSON.stringify(metrics));
}
async function doImport() {
  const { prisma } = await import("../lib/core/db");
  const m = await meta(),
    params = JSON.parse(await readFile(parameterPath(), "utf8")) as Parameters;
  const manifest = JSON.parse(
    await readFile(path.join(runDir(params, m.fingerprint), "manifest.json"), "utf8"),
  );
  const metrics = JSON.parse(
    await readFile(path.join(runDir(params, m.fingerprint), "backtest.json"), "utf8").catch(
      () => "null",
    ),
  );
  await prisma.scoreParameters.upsert({
    where: { version: params.version },
    update: {},
    create: { version: params.version, data: params as never },
  });
  await prisma.scoreRun.upsert({
    where: { id: manifest.runId },
    update: { status: "importing", completedAt: null },
    create: { id: manifest.runId, parameterVersion: params.version, manifest, status: "importing" },
  });
  for (const c of m.companies)
    await prisma.scoreCompany.upsert({
      where: { id: c.id },
      update: { groupId: c.groupId, currency: c.currency },
      create: { id: c.id, groupId: c.groupId, currency: c.currency },
    });
  let batch: Result[] = [],
    imported = 0;
  async function flush() {
    if (!batch.length) return;
    await prisma.$transaction(
      batch.map((r) =>
        prisma.companyMonthScore.upsert({
          where: {
            runId_companyId_month: { runId: manifest.runId, companyId: r.company, month: r.month },
          },
          update: {
            score: r.score,
            confidence: r.confidence,
            band: r.band,
            action: r.action,
            direction: r.direction,
            recommendedLimit: r.recommendedLimit,
            appliedLimit: r.appliedLimit,
            data: r as never,
          },
          create: {
            runId: manifest.runId,
            companyId: r.company,
            month: r.month,
            score: r.score,
            confidence: r.confidence,
            band: r.band,
            action: r.action,
            direction: r.direction,
            recommendedLimit: r.recommendedLimit,
            appliedLimit: r.appliedLimit,
            data: r as never,
          },
        }),
      ),
    );
    imported += batch.length;
    batch = [];
  }
  for await (const r of lines(path.join(runDir(params, m.fingerprint), "scores.jsonl"))) {
    batch.push(scoreResultSchema.parse(r));
    if (batch.length >= 100) await flush();
  }
  await flush();
  if (imported !== manifest.rows)
    throw new Error(`imported ${imported}, expected ${manifest.rows}`);
  await prisma.scoreRun.update({
    where: { id: manifest.runId },
    data: { status: "complete", completedAt: new Date(), metrics },
  });
  await prisma.$disconnect();
  console.log(JSON.stringify({ imported, runId: manifest.runId }));
}
await mkdir(dir, { recursive: true });
if (command === "fit") await doFit();
else if (command === "score") await doScore();
else if (command === "backtest") await doBacktest();
else if (command === "import") await doImport();
else throw new Error("Usage: scoring.ts fit|score|backtest|import");
