import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataset = path.resolve(process.env.SCORING_DATASET ?? path.join(root, "dataset"));
const output = path.resolve(process.env.SCORING_OUT ?? path.join(root, "tmp", "scoring-inference"));
const frozenRoot = path.join(root, "artifacts", "inference", "scoreSolo-holding-v7");

process.env.SCORING_DATASET ??= dataset;
process.env.SCORING_OUT ??= output;
process.env.SCORING_PARAMS ??= path.join(frozenRoot, "parameters.json");
process.env.FORECAST_PARAMS ??= path.join(frozenRoot, "forecast-parameters.json");

function requiredDatasetFiles(): string[] {
  return [
    "companies.csv",
    "banking_products.csv",
    "debt_products.csv",
    "transactions.csv",
    "invoices.csv",
  ].map((name) => path.join(dataset, name));
}

function runScript(label: string, script: string, command: string): void {
  console.log(`[pipeline:eval] ${label}`);
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", path.join(root, "scripts", script), command],
    { cwd: root, env: process.env, stdio: "inherit" },
  );
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(`${label}: proceso terminado con código ${result.status ?? "desconocido"}`);
}

async function main(): Promise<void> {
  const missing = requiredDatasetFiles().filter((file) => !existsSync(file));
  if (missing.length) throw new Error(`dataset incompleto; faltan: ${missing.join(", ")}`);
  if (!existsSync(process.env.SCORING_PARAMS!))
    throw new Error(`parámetros de scoring no encontrados: ${process.env.SCORING_PARAMS}`);
  if (!existsSync(process.env.FORECAST_PARAMS!))
    throw new Error(`parámetros de forecast no encontrados: ${process.env.FORECAST_PARAMS}`);

  const io = await import("./scoring-io");
  const scoring = await io.scoringParams();
  const forecast = await import("../lib/features/forecast/contracts");
  const forecastParams = forecast.forecastParametersSchema.parse(
    JSON.parse(
      await (await import("node:fs/promises")).readFile(process.env.FORECAST_PARAMS!, "utf8"),
    ),
  );
  if (forecastParams.versionScoring !== scoring.version)
    throw new Error(
      `parámetros incompatibles: forecast=${forecastParams.versionScoring}, scoring=${scoring.version}`,
    );

  await io.meta();
  runScript("scoring", "scoring.ts", "score");
  runScript("forecast", "forecast.ts", "run");
  runScript("decisión", "scoring.ts", "decide");
  runScript("submission", "export-submission.ts", "");
}

try {
  await main();
} catch (error) {
  console.error(`[pipeline:eval] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
