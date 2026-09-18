import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url)); // scripts
const repoRoot = path.resolve(rootDir, "..");

const TEST_PATTERNS = ["lib/**/*.test.ts", "app/**/*.test.ts"];

const files = [...new Set(TEST_PATTERNS.flatMap((pattern) => globSync(pattern, { cwd: repoRoot })))]
  .filter((file) => !file.split(/[\\/]/).includes("node_modules"))
  .sort();

if (files.length === 0) {
  console.error("No test files found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  stdio: "inherit",
  cwd: repoRoot,
});

process.exit(result.status ?? 1);
