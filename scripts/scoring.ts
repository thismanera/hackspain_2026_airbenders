import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { decisionRowSchema } from "../lib/features/decision/contracts";
import { decideGroup, parametrosDecision } from "../lib/features/decision/engine";
import { metricasDecision } from "../lib/features/decision/metrics";
import type { DecisionRow } from "../lib/features/decision/types";
import { previsiones } from "../lib/features/forecast/adapter";
import type { ForecastRow } from "../lib/features/forecast/types";
import { backtest } from "../lib/features/scoring/backtest";
import { scoreRowSchema } from "../lib/features/scoring/contracts";
import { prepareGroup, scoreGroup, variablesAt } from "../lib/features/scoring/engine";
import { fitPercentiles, groupSplit, type Sample } from "../lib/features/scoring/fit";
import { ingest } from "../lib/features/scoring/ingest";
import { VARIABLES } from "../lib/features/scoring/params";
import type { ScoreRow } from "../lib/features/scoring/types";
import { CALENDAR } from "../lib/features/scoring/windows";
import {
  BACKTEST_MONTHS,
  categoriesCsv,
  close,
  dataset,
  dir,
  FIT_CUTOFF,
  groupInput,
  groupsOf,
  lines,
  meta,
  put,
  runDir,
  scoringParams,
} from "./scoring-io";

const command = process.argv[2];

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of gen) out.push(x);
  return out;
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
  const params = await scoringParams();
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
  const params = await scoringParams();
  const decParams = parametrosDecision(params.version);
  const run = runDir(params, m.fingerprint);
  // forecast-engine §8 → decision §1: si hay previsión en el run, se conecta; si no, "desconectado".
  const forecastsFile = path.join(run, "forecasts.jsonl");
  const prev = existsSync(forecastsFile)
    ? previsiones(await collect(lines<ForecastRow>(forecastsFile)))
    : undefined;
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
    // Con forecasts.jsonl ausente el motor opera como "desconectado" (§1).
    for (const decision of decideGroup(rows, decParams, prev)) {
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
    prevision: prev ? "conectada" : "desconectada",
  };
  console.log(JSON.stringify(summary));
}

async function doBacktest() {
  const m = await meta();
  const params = await scoringParams();
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
  const metrics = {
    ...backtest(rows, { months: BACKTEST_MONTHS }),
    months: BACKTEST_MONTHS,
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
  const params = await scoringParams();
  const run = runDir(params, m.fingerprint);
  // Antes de borrar nada: sin las dos salidas la importación dejaría la ejecución a medias.
  if (!existsSync(path.join(run, "scores.jsonl")) || !existsSync(path.join(run, "decisions.jsonl")))
    throw new Error("run scoring:score and scoring:decide first");
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
