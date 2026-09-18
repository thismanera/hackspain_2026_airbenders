// Replaces the template placeholder name with the real project name.
// Usage: pnpm run rename-project -- "Mi Proyecto"
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const displayName = process.argv[2]?.trim();
if (!displayName) {
  console.error('Usage: pnpm run rename-project -- "Mi Proyecto"');
  process.exit(1);
}

const slug = displayName
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "") // strip accents
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const dbName = slug.replace(/-/g, "_");

const PLACEHOLDER_NAME = "Plantilla Next.js";
const PLACEHOLDER_SLUG = "plantilla-nextjs";
const PLACEHOLDER_DB = "plantilla_nextjs";

const targets = [
  "package.json",
  "README.md",
  "CLAUDE.md",
  ".env.example",
  "app/layout.tsx",
  "app/page.tsx",
];

let changedFiles = 0;
for (const relativePath of targets) {
  const filePath = path.join(rootDir, relativePath);
  let contents;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch {
    continue; // file doesn't exist in this copy, skip
  }

  const updated = contents
    .replaceAll(PLACEHOLDER_NAME, displayName)
    .replaceAll(PLACEHOLDER_SLUG, slug)
    .replaceAll(PLACEHOLDER_DB, dbName);

  if (updated !== contents) {
    writeFileSync(filePath, updated);
    changedFiles++;
  }
}

console.log(`Renamed template to "${displayName}" (${slug}) in ${changedFiles} file(s).`);
