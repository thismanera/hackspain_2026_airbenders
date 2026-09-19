import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { createInterface } from "node:readline";

import { decisionRowSchema, type DecisionRowDTO } from "../lib/features/decision/contracts";
import { decideLegacy } from "../lib/features/decision/legacy";
import type { DecisionRow } from "../lib/features/decision/types";
import { backtest } from "../lib/features/scoring/backtest";
import { scoreRowSchema, type ScoreRowDTO } from "../lib/features/scoring/contracts";
import {
  prepareGroup,
  scoreGroup,
  variablesAt,
  type GroupInput,
} from "../lib/features/scoring/engine";
import { fitPercentiles, groupSplit, type Sample } from "../lib/features/scoring/fit";
import { fingerprint, ingest, readPartition, type Meta } from "../lib/features/scoring/ingest";
import { VARIABLES } from "../lib/features/scoring/params";
import type { Invoice, Parameters, Product, ScoreRow, Tx } from "../lib/features/scoring/types";
import { CALENDAR } from "../lib/features/scoring/windows";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataset = path.resolve(process.env.SCORING_DATASET ?? path.join(root, "dataset"));
const dir = path.resolve(process.env.SCORING_OUT ?? path.join(root, "tmp", "scoring-v1"));
/** El CSV de categorías normalizadas es opcional (está en .gitignore): si falta, se ingesta sin él. */
const categoriesCsv = (() => {
  const file = path.resolve(
    process.env.SCORING_CATEGORIES ?? path.join(root, "analysis", "transaction_categories.csv"),
  );
  return existsSync(file) ? file : null;
})();
/** Ventana de validación del backtest (§13). */
const BACKTEST_MONTHS: [string, string] = ["2026-03", "2026-08"];
/** Último mes de ajuste: los percentiles solo ven muestras ≤ 2026-02 (§11). */
const FIT_CUTOFF = "2026-02";
const command = process.argv[2];

function runDir(params: Parameters, inputFingerprint: string): string {
  return path.join(dir, "runs", params.version, inputFingerprint);
}
function parameterPath(): string {
  return path.resolve(process.env.SCORING_PARAMS ?? path.join(dir, "parameters.json"));
}
async function meta(): Promise<Meta> {
  const m = JSON.parse(await readFile(path.join(dir, "ingest.json"), "utf8")) as Meta;
  if (m.fingerprint !== (await fingerprint(dataset, categoriesCsv)))
    throw new Error("dataset changed; run fit again with SCORING_REINGEST=1");
  return m;
}
/** Las particiones se escriben por grupo, así que un `GroupInput` se arma de una sola lectura. */
async function groupInput(groupId: string, m: Meta): Promise<GroupInput> {
  const txs = await readPartition<Tx>(dir, groupId, "tx");
  const invoices = new Map<string, Invoice[]>();
  for (const invoice of await readPartition<Invoice>(dir, groupId, "invoice")) {
    const list = invoices.get(invoice.company) ?? [];
    list.push(invoice);
    invoices.set(invoice.company, list);
  }
  return {
    groupId,
    companies: m.companies.filter((c) => c.groupId === groupId),
    txs,
    invoices,
    schedule: new Map(Object.entries(m.schedule)),
    products: new Map(Object.entries(m.products) as [string, Product][]),
  };
}
function groupsOf(m: Meta): string[] {
  return [...new Set(m.companies.map((c) => c.groupId))].sort();
}
async function* lines<T>(file: string): AsyncGenerator<T> {
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity }))
    if (line) yield JSON.parse(line) as T;
}
async function put(
  stream: ReturnType<typeof createWriteStream>,
  item: ScoreRowDTO | DecisionRowDTO,
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
      ? await ingest(dataset, dir, categoriesCsv)
      : await meta().catch(() => ingest(dataset, dir, categoriesCsv));
  const groups = groupsOf(m);
  const split = groupSplit(groups);
  const train = new Set(split.train);
  const samples: Sample[] = [];
  const cutoff = CALENDAR.indexOf(FIT_CUTOFF);
  for (const g of groups) {
    if (!train.has(g)) continue;
    const prepared = prepareGroup(await groupInput(g, m));
    for (const p of prepared.values())
      for (let t = 0; t <= cutoff; t++) {
        const { vars } = variablesAt(p, t);
        for (const id of VARIABLES) samples.push({ id, raw: vars[id].raw, conf: vars[id].conf });
      }
  }
  const params = fitPercentiles(samples, split.train, split.validation, m.fingerprint);
  await mkdir(path.join(dir, "runs", params.version), { recursive: true });
  await writeFile(path.join(dir, "parameters.json"), JSON.stringify(params));
  await writeFile(
    path.join(dir, "runs", params.version, "parameters.json"),
    JSON.stringify(params),
  );
  const summary = {
    samples: samples.length,
    trainGroups: split.train.length,
    validationGroups: split.validation.length,
    version: params.version,
    diagnostics: m.diagnostics,
  };
  await writeFile(path.join(dir, "fit.json"), JSON.stringify(summary));
  console.log(JSON.stringify(summary));
}

async function doScore() {
  const m = await meta().catch(() => ingest(dataset, dir, categoriesCsv));
  const params = JSON.parse(await readFile(parameterPath(), "utf8")) as Parameters;
  await mkdir(runDir(params, m.fingerprint), { recursive: true });
  const output = createWriteStream(path.join(runDir(params, m.fingerprint), "scores.jsonl"));
  let count = 0;
  for (const g of groupsOf(m))
    for (const row of scoreGroup(await groupInput(g, m), params)) {
      await put(output, scoreRowSchema.parse(row));
      count++;
    }
  await close(output);
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

async function doDecide() {
  const m = await meta();
  const params = JSON.parse(await readFile(parameterPath(), "utf8")) as Parameters;
  const byCompany = new Map<string, ScoreRow[]>();
  for await (const row of lines<ScoreRow>(
    path.join(runDir(params, m.fingerprint), "scores.jsonl"),
  )) {
    const list = byCompany.get(row.company) ?? [];
    list.push(row);
    byCompany.set(row.company, list);
  }
  const output = createWriteStream(path.join(runDir(params, m.fingerprint), "decisions.jsonl"));
  let count = 0;
  for (const rows of byCompany.values()) {
    // `decideLegacy` arrastra el límite vigente del mes anterior: exige orden cronológico.
    rows.sort((a, b) => a.month.localeCompare(b.month));
    for (const decision of decideLegacy(rows)) {
      await put(output, decisionRowSchema.parse(decision));
      count++;
    }
  }
  await close(output);
  console.log(JSON.stringify({ decisions: count, companies: byCompany.size }));
}

async function doBacktest() {
  const m = await meta();
  const params = JSON.parse(await readFile(parameterPath(), "utf8")) as Parameters;
  const validation = new Set(params.validationGroups);
  const rows: ScoreRow[] = [];
  for await (const row of lines<ScoreRow>(path.join(runDir(params, m.fingerprint), "scores.jsonl")))
    if (validation.has(row.groupId)) rows.push(row);
  const metrics = {
    ...backtest(rows, { months: BACKTEST_MONTHS }),
    months: BACKTEST_MONTHS,
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
  const m = await meta();
  const params = JSON.parse(await readFile(parameterPath(), "utf8")) as Parameters;
  const run = runDir(params, m.fingerprint);
  const manifest = JSON.parse(await readFile(path.join(run, "manifest.json"), "utf8")) as {
    runId: string;
    rows: number;
  };
  const metrics = JSON.parse(
    await readFile(path.join(run, "backtest.json"), "utf8").catch(() => "null"),
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
  // Las decisiones cuelgan de la clave compuesta del score: se borran antes por la FK.
  await prisma.companyMonthDecision.deleteMany({ where: { runId: manifest.runId } });
  await prisma.companyMonthScore.deleteMany({ where: { runId: manifest.runId } });
  let batch: ScoreRow[] = [];
  let imported = 0;
  async function flush() {
    if (!batch.length) return;
    await prisma.companyMonthScore.createMany({
      data: batch.map((r) => ({
        runId: manifest.runId,
        companyId: r.company,
        month: r.month,
        score: r.score,
        confidence: r.confianza,
        estado: r.estado,
        direction: r.direccion,
        data: r as never,
      })),
    });
    imported += batch.length;
    batch = [];
  }
  for await (const r of lines<ScoreRow>(path.join(run, "scores.jsonl"))) {
    batch.push(scoreRowSchema.parse(r) as ScoreRow);
    if (batch.length >= 500) await flush();
  }
  await flush();
  if (imported !== manifest.rows)
    throw new Error(`imported ${imported}, expected ${manifest.rows}`);
  let decisions: DecisionRow[] = [];
  let importedDecisions = 0;
  async function flushDecisions() {
    if (!decisions.length) return;
    await prisma.companyMonthDecision.createMany({
      data: decisions.map((d) => ({
        runId: manifest.runId,
        companyId: d.company,
        month: d.month,
        band: d.banda,
        action: d.accion,
        recommendedLimit: d.limiteRecomendado,
        appliedLimit: d.limiteVigente,
        data: d as never,
      })),
    });
    importedDecisions += decisions.length;
    decisions = [];
  }
  for await (const d of lines<DecisionRow>(path.join(run, "decisions.jsonl"))) {
    decisions.push(decisionRowSchema.parse(d));
    if (decisions.length >= 500) await flushDecisions();
  }
  await flushDecisions();
  await prisma.scoreRun.update({
    where: { id: manifest.runId },
    data: { status: "complete", completedAt: new Date(), metrics },
  });
  await prisma.$disconnect();
  console.log(JSON.stringify({ imported, importedDecisions, runId: manifest.runId }));
}

await mkdir(dir, { recursive: true });
if (command === "fit") await doFit();
else if (command === "score") await doScore();
else if (command === "decide") await doDecide();
else if (command === "backtest") await doBacktest();
else if (command === "import") await doImport();
else throw new Error("Usage: scoring.ts fit|score|decide|backtest|import");
