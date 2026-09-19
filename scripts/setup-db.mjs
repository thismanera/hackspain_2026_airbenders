import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, copyFile, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const force = process.argv.includes("--force");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
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
  });

  if (result.error) {
    if (command === "docker") {
      throw new Error(
        "Docker is not available. Start Docker Desktop and enable Settings → Resources → WSL Integration for this distribution.",
        { cause: result.error },
      );
    }
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

function completedRunExists() {
  const output = run(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "scoring",
      "-d",
      "scoring",
      "-tAc",
      "SELECT EXISTS (SELECT 1 FROM score_runs r WHERE r.status = 'complete' AND EXISTS (SELECT 1 FROM company_month_forecasts f WHERE f.run_id = r.id));",
    ],
    { capture: true },
  );
  return output === "t";
}

async function main() {
  await ensureEnvironment();

  log("Starting PostgreSQL in Docker.");
  run("docker", ["compose", "up", "-d", "--wait", "postgres"]);

  log("Generating Prisma Client and applying the schema.");
  run(pnpm, ["exec", "prisma", "generate"]);
  // DB de desarrollo del hackathon: se reconstruye desde los CSV, así que aceptamos perder datos.
  run(pnpm, ["exec", "prisma", "db", "push", "--accept-data-loss"]);

  if (!force && completedRunExists()) {
    log("A completed scoring run already exists. PostgreSQL is ready.");
    return;
  }

  await assertDatasetReady();
  log(force ? "Rebuilding and importing scoring data." : "Building and importing scoring data.");
  run(pnpm, ["scoring:fit"]);
  run(pnpm, ["scoring:score"]);
  run(pnpm, ["forecast:fit"]);
  run(pnpm, ["forecast:run"]);
  run(pnpm, ["scoring:decide"]);
  run(pnpm, ["scoring:backtest"]);
  run(pnpm, ["forecast:backtest"]);
  run(pnpm, ["scoring:import"]);

  log("PostgreSQL is ready with scoring data.");
}

main().catch((error) => {
  console.error(`\n[db:setup] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
