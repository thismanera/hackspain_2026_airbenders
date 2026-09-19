import { once } from "node:events";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import type { ForecastParameters } from "../lib/features/forecast/params";
import { forecastRowSchema } from "../lib/features/forecast/contracts";
import type { ForecastRow } from "../lib/features/forecast/types";
import type { GroupInput } from "../lib/features/scoring/engine";
import { fingerprint, readPartition, type Meta } from "../lib/features/scoring/ingest";
import type { Invoice, Parameters, Product, Tx } from "../lib/features/scoring/types";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const dataset = path.resolve(process.env.SCORING_DATASET ?? path.join(root, "dataset"));
export const dir = path.resolve(process.env.SCORING_OUT ?? path.join(root, "tmp", "scoring-v1"));
/** El CSV de categorías normalizadas es opcional (está en .gitignore): si falta, se ingesta sin él. */
export const categoriesCsv = (() => {
  const file = path.resolve(
    process.env.SCORING_CATEGORIES ?? path.join(root, "analysis", "transaction_categories.csv"),
  );
  return existsSync(file) ? file : null;
})();
/** Ventana de validación del backtest (scoring §13). */
export const BACKTEST_MONTHS: [string, string] = ["2025-09", "2026-08"];
/** Último mes de ajuste: los percentiles solo ven muestras ≤ 2026-02 (scoring §11). */
export const FIT_CUTOFF = "2026-02";

export function runDir(params: Parameters, inputFingerprint: string): string {
  return path.join(dir, "runs", params.version, inputFingerprint);
}
export function parameterPath(): string {
  return path.resolve(process.env.SCORING_PARAMS ?? path.join(dir, "parameters.json"));
}
export async function meta(): Promise<Meta> {
  const m = JSON.parse(await readFile(path.join(dir, "ingest.json"), "utf8")) as Meta;
  if (m.fingerprint !== (await fingerprint(dataset, categoriesCsv)))
    throw new Error("dataset changed; run fit again with SCORING_REINGEST=1");
  return m;
}
export async function scoringParams(): Promise<Parameters> {
  return JSON.parse(await readFile(parameterPath(), "utf8")) as Parameters;
}
/** Las particiones se escriben por grupo, así que un `GroupInput` se arma de una sola lectura. */
export async function groupInput(groupId: string, m: Meta): Promise<GroupInput> {
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
export function groupsOf(m: Meta): string[] {
  return [...new Set(m.companies.map((c) => c.groupId))].sort();
}
/** Previsiones del run, o undefined si no hay; falla si están desfasadas respecto a forecast-parameters.json. */
export async function readForecasts(run: string): Promise<ForecastRow[] | undefined> {
  const file = path.join(run, "forecasts.jsonl");
  if (!existsSync(file)) return undefined;
  const paramsFile = path.join(run, "forecast-parameters.json");
  if (!existsSync(paramsFile))
    throw new Error("forecast-parameters.json missing; run forecast:fit and forecast:run");
  const fp = JSON.parse(await readFile(paramsFile, "utf8")) as ForecastParameters;
  const rows: ForecastRow[] = [];
  for await (const raw of lines<ForecastRow>(file)) {
    const row = forecastRowSchema.parse(raw);
    // Una previsión de otra versión de parámetros no describe este run: mejor parar que mezclar.
    if (row.versionParametros !== fp.version)
      throw new Error(
        `forecasts.jsonl is stale (${row.versionParametros} != ${fp.version}); run forecast:run`,
      );
    rows.push(row);
  }
  return rows;
}
export async function* lines<T>(file: string): AsyncGenerator<T> {
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity }))
    if (line) yield JSON.parse(line) as T;
}
export async function put<T>(stream: ReturnType<typeof createWriteStream>, item: T): Promise<void> {
  if (!stream.write(JSON.stringify(item) + "\n")) await once(stream, "drain");
}
export async function close(stream: ReturnType<typeof createWriteStream>): Promise<void> {
  stream.end();
  await once(stream, "finish");
}
