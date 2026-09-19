import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { createInterface } from "node:readline";

import { decisionRowSchema, type DecisionRowDTO } from "../lib/features/decision/contracts";
import { decideGroup, parametrosDecision } from "../lib/features/decision/engine";
import { metricasDecision } from "../lib/features/decision/metrics";
import type { DecisionRow } from "../lib/features/decision/types";
import { previsiones } from "../lib/features/forecast/adapter";
import { forecastParametersSchema, forecastRowSchema } from "../lib/features/forecast/contracts";
import type { ForecastRow } from "../lib/features/forecast/types";
import type { ForecastParameters } from "../lib/features/forecast/params";
import { backtest } from "../lib/features/scoring/backtest";
import {
  parametersSchema,
  scoreRowSchema,
  type ScoreRowDTO,
} from "../lib/features/scoring/contracts";
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
/** Ventanas temporales de validación; septiembre de 2026 queda fuera por estar truncado. */
const BACKTEST_WINDOWS = {
  trailing6: ["2026-03", "2026-08"],
  trailing9: ["2025-12", "2026-08"],
  trailing12: ["2025-09", "2026-08"],
  startup6: ["2025-09", "2026-02"],
  startup9: ["2025-09", "2026-05"],
  startup12: ["2025-09", "2026-08"],
} as const satisfies Record<string, readonly [string, string]>;
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
  const params = parametersSchema.parse(JSON.parse(await readFile(parameterPath(), "utf8")));
  if (params.inputFingerprint !== m.fingerprint)
    throw new Error("parameters were fitted on a different dataset; run scoring:fit");
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
  const scoringParams = parametersSchema.parse(JSON.parse(await readFile(parameterPath(), "utf8")));
  const decParams = parametrosDecision(scoringParams.version);
  const run = runDir(scoringParams, m.fingerprint);
  const forecastFile = path.join(run, "forecasts.jsonl");
  const forecastParametersFile = path.join(run, "forecast-parameters.json");
  const forecastRows: ForecastRow[] = [];
  if (!existsSync(forecastFile) || !existsSync(forecastParametersFile))
    throw new Error("forecast artifacts missing or stale; run forecast:fit and forecast:run first");
  const forecastParameters = forecastParametersSchema.parse(
    JSON.parse(await readFile(forecastParametersFile, "utf8")),
  );
  if (forecastParameters.versionScoring !== scoringParams.version)
    throw new Error("forecast artifacts use an incompatible scoring version; run forecast:fit");
  for await (const row of lines<ForecastRow>(forecastFile)) {
    const parsed = forecastRowSchema.parse(row);
    if (parsed.versionParametros !== forecastParameters.version)
      throw new Error("forecast artifacts are stale; run forecast:run");
    forecastRows.push(parsed);
  }
  const forecastMap = previsiones(forecastRows);
  // El motor v1 decide **un grupo entero** de una vez (techo consolidado y cross-default, §9):
  // agrupar por `groupId` no es una optimización, es el contrato de `decideGroup`.
  const byGroup = new Map<string, ScoreRow[]>();
  for await (const row of lines<ScoreRow>(path.join(run, "scores.jsonl"))) {
    const list = byGroup.get(row.groupId) ?? [];
    list.push(row);
    byGroup.set(row.groupId, list);
  }
  const output = createWriteStream(path.join(run, "decisions.jsonl"));
  const companies = new Set<string>();
  let count = 0;
  for (const rows of byGroup.values())
    // Sin previsión conectada el motor opera como "desconectado" (§1): `banda_pred_3m = banda`.
    for (const decision of decideGroup(rows, decParams, forecastMap)) {
      await put(output, decisionRowSchema.parse(decision));
      companies.add(decision.company);
      count++;
    }
  await close(output);
  await writeFile(path.join(run, "decision-parameters.json"), JSON.stringify(decParams));
  const summary = {
    decisions: count,
    companies: companies.size,
    groups: byGroup.size,
    version: decParams.version,
  };
  console.log(JSON.stringify(summary));
}

async function doBacktest() {
  const m = await meta();
  const params = parametersSchema.parse(JSON.parse(await readFile(parameterPath(), "utf8")));
  const run = runDir(params, m.fingerprint);
  const validation = new Set(params.validationGroups);
  const rows: ScoreRow[] = [];
  for await (const row of lines<ScoreRow>(path.join(run, "scores.jsonl")))
    if (validation.has(row.groupId)) rows.push(row);
  const companies = new Set(rows.map((r) => r.company));
  // Sin decisiones el bloque `decision` saldría vacío y el backtest mentiría por omisión.
  if (!existsSync(path.join(run, "decisions.jsonl"))) throw new Error("run scoring:decide first");
  // Las métricas del jurado (§14) se miden sobre las mismas empresas que el backtest del score.
  const decisions: DecisionRow[] = [];
  for await (const d of lines<DecisionRow>(path.join(run, "decisions.jsonl")))
    if (companies.has(d.company)) decisions.push(d);
  const report = (months: readonly [string, string]) => ({
    scoreSolo: backtest(rows, { months, targetScore: "scoreSolo" }),
    scoreGrupo: backtest(rows, { months, targetScore: "scoreGrupo" }),
  });
  const windows = Object.fromEntries(
    Object.entries(BACKTEST_WINDOWS).map(([name, months]) => [name, report(months)]),
  );
  const metrics = {
    // Compatibilidad con consumidores que ya leen la ventana completa.
    ...windows.trailing12,
    windows,
    months: BACKTEST_WINDOWS.trailing12,
    validationCompanies: companies.size,
    validationRows: rows.length,
    decision: metricasDecision(rows, decisions),
  };
  await writeFile(path.join(run, "backtest.json"), JSON.stringify(metrics));
  console.log(JSON.stringify(metrics));
}

async function doImport() {
  const { prisma } = await import("../lib/core/db");
  const m = await meta();
  const params = parametersSchema.parse(JSON.parse(await readFile(parameterPath(), "utf8")));
  const run = runDir(params, m.fingerprint);
  // Antes de borrar nada: sin las dos salidas la importación dejaría la ejecución a medias.
  if (
    !existsSync(path.join(run, "scores.jsonl")) ||
    !existsSync(path.join(run, "decisions.jsonl")) ||
    !existsSync(path.join(run, "forecasts.jsonl")) ||
    !existsSync(path.join(run, "forecast-parameters.json"))
  )
    throw new Error("run scoring:score, forecast:fit, forecast:run and scoring:decide first");
  const forecastParameters = forecastParametersSchema.parse(
    JSON.parse(await readFile(path.join(run, "forecast-parameters.json"), "utf8")),
  ) as ForecastParameters;
  if (forecastParameters.versionScoring !== params.version)
    throw new Error("forecast parameters were fitted on another scoring version");
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
  await prisma.forecastParameters.upsert({
    where: { version: forecastParameters.version },
    update: {
      versionScoring: forecastParameters.versionScoring,
      data: forecastParameters as never,
    },
    create: {
      version: forecastParameters.version,
      versionScoring: forecastParameters.versionScoring,
      data: forecastParameters as never,
    },
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
  await prisma.companyMonthForecast.deleteMany({ where: { runId: manifest.runId } });
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
        scoreSolo: r.scoreSolo,
        confidence: r.confianza,
        estadoGrupo: r.estadoGrupo,
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
  let forecasts: ForecastRow[] = [];
  for await (const f of lines<ForecastRow>(path.join(run, "forecasts.jsonl")))
    forecasts.push(forecastRowSchema.parse(f));
  await prisma.companyMonthForecast.createMany({
    data: forecasts.map((f) => ({
      runId: manifest.runId,
      companyId: f.company,
      month: f.month,
      parameterVersion: forecastParameters.version,
      scoreSoloPred3m: f.horizontes[3].scoreSoloPred,
      scoreGrupoPred3m: f.horizontes[3].scoreGrupoPred,
      scoreSoloPred6m: f.horizontes[6].scoreSoloPred,
      scoreGrupoPred6m: f.horizontes[6].scoreGrupoPred,
      bandaSoloPred3m: f.horizontes[3].bandaSoloPred,
      bandaGrupoPred3m: f.horizontes[3].bandaGrupoPred,
      direccionSolo: f.direccionSoloPred,
      direccionGrupo: f.direccionGrupoPred,
      metodoSolo: f.metodoSolo,
      metodoGrupo: f.metodoGrupo,
      data: f as never,
    })),
  });
  let decisions: DecisionRow[] = [];
  let importedDecisions = 0;
  async function flushDecisions() {
    if (!decisions.length) return;
    await prisma.companyMonthDecision.createMany({
      data: decisions.map((d) => ({
        runId: manifest.runId,
        companyId: d.company,
        month: d.month,
        // La ficha enseña la banda con la que se decidió (escalón de grupo incluido, §9).
        band: d.bandaEfectiva,
        action: d.accion,
        recommendedLimit: d.L,
        appliedLimit: d.LVigente,
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
  if (importedDecisions !== manifest.rows)
    throw new Error(`imported ${importedDecisions} decisions, expected ${manifest.rows}`);
  await prisma.scoreRun.update({
    where: { id: manifest.runId },
    data: { metrics },
  });
  const snapshots = await doSnapshot(manifest.runId);
  await prisma.scoreRun.update({
    where: { id: manifest.runId },
    data: { status: "complete", completedAt: new Date() },
  });
  await prisma.$disconnect();
  console.log(JSON.stringify({ imported, importedDecisions, snapshots, runId: manifest.runId }));
}

async function localRunId(): Promise<string> {
  const params = parametersSchema.parse(JSON.parse(await readFile(parameterPath(), "utf8")));
  const run = runDir(params, (await meta()).fingerprint);
  const manifest = JSON.parse(await readFile(path.join(run, "manifest.json"), "utf8")) as {
    runId: string;
  };
  return manifest.runId;
}

/**
 * Materializa el panel de una ejecución ya importada: cada respuesta que la UI
 * puede pedir queda como una fila en `portfolio_snapshots`. Sin `runId` usa la
 * ejecución del run local. Se puede relanzar solo: borra y vuelve a escribir.
 */
async function doSnapshot(runId?: string): Promise<number> {
  const { prisma } = await import("../lib/core/db");
  const { buildDataset, runHeader } = await import("../lib/features/portfolio/load-dataset");
  const { materialize } = await import("../lib/features/portfolio/snapshots");
  const id = runId ?? (await localRunId());
  const dataset = await buildDataset(await runHeader(id));
  await prisma.portfolioSnapshot.deleteMany({ where: { runId: id } });
  let written = 0;
  let batch: { runId: string; kind: string; key: string; payload: never }[] = [];
  async function flush() {
    if (!batch.length) return;
    await prisma.portfolioSnapshot.createMany({ data: batch });
    written += batch.length;
    batch = [];
  }
  for (const row of materialize(dataset)) {
    batch.push({ runId: id, kind: row.kind, key: row.key, payload: row.payload as never });
    if (batch.length >= 100) await flush();
  }
  await flush();
  return written;
}

await mkdir(dir, { recursive: true });
if (command === "fit") await doFit();
else if (command === "score") await doScore();
else if (command === "decide") await doDecide();
else if (command === "backtest") await doBacktest();
else if (command === "import") await doImport();
else if (command === "snapshot") {
  const written = await doSnapshot(process.argv[3]);
  console.log(JSON.stringify({ snapshots: written }));
} else throw new Error("Usage: scoring.ts fit|score|decide|backtest|import|snapshot [runId]");
