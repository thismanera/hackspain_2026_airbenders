import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { decideGroup, parametrosDecision } from "../lib/features/decision/engine";
import type { DecisionRow } from "../lib/features/decision/types";
import { previsiones } from "../lib/features/forecast/adapter";
import { backtestForecast } from "../lib/features/forecast/backtest";
import { forecastRowSchema } from "../lib/features/forecast/contracts";
import { forecastGroup } from "../lib/features/forecast/engine";
import { fitForecast } from "../lib/features/forecast/fit";
import type { ForecastParameters, Horizonte } from "../lib/features/forecast/params";
import type { ForecastGroupInput, ForecastRow, MonthlyFlow } from "../lib/features/forecast/types";
import { type Prepared, prepareGroup, variablesAt } from "../lib/features/scoring/engine";
import type { Sample } from "../lib/features/scoring/fit";
import { VARIABLES } from "../lib/features/scoring/params";
import type { ScoreRow } from "../lib/features/scoring/types";
import { CALENDAR } from "../lib/features/scoring/windows";
import {
  close,
  dir,
  FIT_CUTOFF,
  groupInput,
  lines,
  meta,
  put,
  runDir,
  scoringParams,
} from "./scoring-io";

/** Ventanas de §9: `t` de la previsión; `t + h` debe existir en el calendario. */
const VENTANAS = {
  3: ["2025-09", "2026-02"],
  6: ["2025-09", "2025-11"],
} satisfies Record<Horizonte, [string, string]>;
const command = process.argv[2];

function forecastParameterPath(): string {
  return path.resolve(process.env.FORECAST_PARAMS ?? path.join(dir, "forecast-parameters.json"));
}
async function forecastParams(): Promise<ForecastParameters> {
  return JSON.parse(await readFile(forecastParameterPath(), "utf8")) as ForecastParameters;
}
async function scoresByGroup(run: string): Promise<Map<string, ScoreRow[]>> {
  const byGroup = new Map<string, ScoreRow[]>();
  for await (const row of lines<ScoreRow>(path.join(run, "scores.jsonl"))) {
    const list = byGroup.get(row.groupId) ?? [];
    list.push(row);
    byGroup.set(row.groupId, list);
  }
  return byGroup;
}
/** Flujos mensuales mínimos por empresa a partir de un grupo ya preparado (misma preparación que scoring). */
function flowsFrom(prepared: Map<string, Prepared>): Map<string, (MonthlyFlow | undefined)[]> {
  return new Map(
    [...prepared].map(([id, p]) => [
      id,
      p.history.map((f) =>
        f ? { observed: f.observed, cobrosOp: f.cobrosOp, pagosOp: f.pagosOp } : undefined,
      ),
    ]),
  );
}
/** Atajo para quien aún no tiene el grupo preparado (`run`, `backtest`). */
async function flowsOf(
  groupId: string,
  m: Awaited<ReturnType<typeof meta>>,
): Promise<Map<string, (MonthlyFlow | undefined)[]>> {
  return flowsFrom(prepareGroup(await groupInput(groupId, m)));
}

async function doFit() {
  const m = await meta();
  const params = await scoringParams();
  const run = runDir(params, m.fingerprint);
  if (!existsSync(path.join(run, "scores.jsonl"))) throw new Error("run scoring:score first");
  const byGroup = await scoresByGroup(run);
  const cutoff = CALENDAR.indexOf(FIT_CUTOFF);
  const samples: Sample[] = [];
  const grupos: ForecastGroupInput[] = [];
  for (const g of params.trainGroups) {
    const rows = byGroup.get(g);
    if (!rows) continue;
    const prepared = prepareGroup(await groupInput(g, m));
    for (const p of prepared.values())
      for (let t = 0; t <= cutoff; t++) {
        const { vars } = variablesAt(p, t);
        for (const id of VARIABLES) samples.push({ id, raw: vars[id].raw, conf: vars[id].conf });
      }
    grupos.push({ groupId: g, rows, flows: flowsFrom(prepared) });
  }
  const fp = fitForecast({
    samples,
    grupos,
    percentiles: params.percentiles,
    versionScoring: params.version,
    cutoff: FIT_CUTOFF,
  });
  await writeFile(forecastParameterPath(), JSON.stringify(fp));
  await writeFile(path.join(run, "forecast-parameters.json"), JSON.stringify(fp));
  const summary = {
    version: fp.version,
    conectado: fp.conectado,
    ajuste: fp.ajuste,
    trainGroups: grupos.length,
  };
  await writeFile(path.join(dir, "forecast-fit.json"), JSON.stringify(summary));
  console.log(JSON.stringify(summary));
}

async function doRun() {
  const m = await meta();
  const params = await scoringParams();
  if (!existsSync(forecastParameterPath())) throw new Error("run forecast:fit first");
  const fp = await forecastParams();
  if (fp.versionScoring !== params.version)
    throw new Error("forecast parameters were fitted on another scoring version; run forecast:fit");
  const run = runDir(params, m.fingerprint);
  if (!existsSync(path.join(run, "scores.jsonl"))) throw new Error("run scoring:score first");
  const byGroup = await scoresByGroup(run);
  const output = createWriteStream(path.join(run, "forecasts.jsonl"));
  let count = 0;
  for (const [g, rows] of byGroup)
    for (const f of forecastGroup(
      { groupId: g, rows, flows: await flowsOf(g, m) },
      fp,
      params.percentiles,
    )) {
      await put(output, forecastRowSchema.parse(f));
      count++;
    }
  await close(output);
  const summary = {
    forecasts: count,
    groups: byGroup.size,
    version: fp.version,
    metodo: fp.conectado ? "v1_proyeccion" : "desconectado",
  };
  console.log(JSON.stringify(summary));
}

async function doBacktest() {
  const m = await meta();
  const params = await scoringParams();
  const run = runDir(params, m.fingerprint);
  if (!existsSync(path.join(run, "forecasts.jsonl"))) throw new Error("run forecast:run first");
  const validation = new Set(params.validationGroups);
  const byGroup = await scoresByGroup(run);
  const forecasts: ForecastRow[] = [];
  for await (const f of lines<ForecastRow>(path.join(run, "forecasts.jsonl")))
    if (validation.has(f.groupId)) forecasts.push(f);
  const prev = previsiones(forecasts);
  const decParams = parametrosDecision(params.version);
  const scores: ScoreRow[] = [];
  const con: DecisionRow[] = [];
  const sin: DecisionRow[] = [];
  for (const [g, rows] of byGroup) {
    if (!validation.has(g)) continue;
    scores.push(...rows);
    con.push(...decideGroup(rows, decParams, prev));
    sin.push(...decideGroup(rows, decParams));
  }
  const report = {
    ...backtestForecast(scores, forecasts, con, sin, VENTANAS),
    validationRows: scores.length,
  };
  await writeFile(path.join(run, "forecast-backtest.json"), JSON.stringify(report));
  console.log(JSON.stringify(report));
}

await mkdir(dir, { recursive: true });
if (command === "fit") await doFit();
else if (command === "run") await doRun();
else if (command === "backtest") await doBacktest();
else throw new Error("Usage: forecast.ts fit|run|backtest");
