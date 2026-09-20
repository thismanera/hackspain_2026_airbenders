import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, copyFile, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { config as loadDotenv } from "dotenv";
import { Client } from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const force = process.argv.includes("--force");
const refit = process.argv.includes("--refit");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
/** Mismo run congelado que `pipeline:eval` y la submission: la demo enseña el modelo que se entrega. */
const frozenRoot = path.join(root, "artifacts", "inference", "scoreSolo-holding-v7");
const inferenceOut = path.join(root, "tmp", "scoring-inference");
const categoriesCsv = path.join(root, "analysis", "transaction_categories.csv");
const requiredDatasetFiles = [
  "companies.csv",
  "banking_products.csv",
  "debt_products.csv",
  "transactions.csv",
  "invoices.csv",
];

function log(message) {
  console.log(`\n[db:setup] ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    // Windows spawnSync needs a shell to run .cmd shims (e.g. pnpm.cmd) reliably.
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const details = options.capture ? (result.stderr || result.stdout).trim() : "";
    throw new Error(`${command} ${args.join(" ")} failed${details ? `: ${details}` : ""}`);
  }
  return options.capture ? result.stdout.trim() : "";
}

async function ensureEnvironment() {
  const target = path.join(root, ".env");
  try {
    await access(target, constants.F_OK);
    return;
  } catch {
    const example = path.join(root, ".env.example");
    await copyFile(example, target);
    const contents = await readFile(target, "utf8");
    const secret = randomBytes(48).toString("base64url");
    await writeFile(target, contents.replace("change-me-32-chars-minimum-please", secret));
    log("Created .env from .env.example with a local Better Auth secret.");
  }
}

async function assertDatasetReady() {
  for (const filename of requiredDatasetFiles) {
    const file = path.join(root, "dataset", filename);
    let handle;
    try {
      handle = await open(file, "r");
      const buffer = Buffer.alloc(128);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const beginning = buffer.subarray(0, bytesRead).toString("utf8");
      if (beginning.startsWith("version https://git-lfs.github.com/spec/v1")) {
        throw new Error(`${filename} is still a Git LFS pointer`);
      }
    } catch (error) {
      throw new Error(
        `Dataset is not ready (${error instanceof Error ? error.message : filename}). Run: git lfs install && git lfs pull`,
        { cause: error },
      );
    } finally {
      await handle?.close();
    }
  }
}

async function completedRunExists(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query(
      "SELECT EXISTS (SELECT 1 FROM score_runs r WHERE r.status = 'complete' AND EXISTS (SELECT 1 FROM portfolio_snapshots s WHERE s.\"runId\" = r.id AND s.kind = 'meta'));",
    );
    return rows[0].exists === true;
  } finally {
    await client.end();
  }
}

async function main() {
  await ensureEnvironment();
  loadDotenv({ path: path.join(root, ".env") });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL no está definido en .env.");
  }

  log("Generating Prisma Client and applying the schema.");
  run(pnpm, ["exec", "prisma", "generate"]);
  // DB de desarrollo del hackathon: se reconstruye desde los CSV, así que aceptamos perder datos.
  run(pnpm, ["exec", "prisma", "db", "push", "--accept-data-loss"]);

  if (!force && (await completedRunExists(databaseUrl))) {
    log("A completed scoring run already exists. La base de datos está lista.");
    return;
  }

  await assertDatasetReady();
  try {
    await access(categoriesCsv, constants.F_OK);
  } catch {
    log(
      "Aviso: falta analysis/transaction_categories.csv (python analysis/08_categories.py && python analysis/09_export_categories.py). Se ingesta sin categorías normalizadas: más empresas quedarán en 'sin datos'.",
    );
  }

  if (refit) {
    log(
      "Refitting parameters from scratch (--refit): la demo dejará de coincidir con la submission.",
    );
    run(pnpm, ["scoring:fit"]);
    run(pnpm, ["scoring:score"]);
    run(pnpm, ["forecast:fit"]);
    run(pnpm, ["forecast:run"]);
    run(pnpm, ["scoring:decide"]);
    run(pnpm, ["scoring:backtest"]);
    run(pnpm, ["forecast:backtest"]);
    run(pnpm, ["scoring:import"]);
  } else {
    log(
      `Scoring with frozen parameters from ${path.relative(root, frozenRoot)} (same run as pipeline:eval).`,
    );
    process.env.SCORING_OUT = inferenceOut;
    process.env.SCORING_PARAMS = path.join(frozenRoot, "parameters.json");
    process.env.FORECAST_PARAMS = path.join(frozenRoot, "forecast-parameters.json");
    run(pnpm, ["pipeline:eval"]);
    run(pnpm, ["scoring:backtest"]);
    run(pnpm, ["forecast:backtest"]);
    run(pnpm, ["scoring:import"]);
  }

  log("Base de datos lista con los datos de scoring.");
}

main().catch((error) => {
  console.error(`\n[db:setup] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
