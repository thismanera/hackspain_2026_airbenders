/** Qué puerta de elegibilidad rechaza a cada empresa. `node --import tsx scripts/gate-diagnostics.mjs` */
import { buildPortfolio } from "../lib/features/portfolio/fixtures.ts";
import { LATEST_MONTH } from "../lib/features/portfolio/calendar.ts";

const counts = {};
const samples = {};

for (const entry of buildPortfolio().values()) {
  const month = entry.months.find((item) => item.month === LATEST_MONTH);
  const failed = month.decision.gates.find((gate) => !gate.passed);
  const key = failed ? failed.id : "pasa todas";
  counts[key] = (counts[key] ?? 0) + 1;
  if (!samples[key]) samples[key] = `${entry.meta.id}: ${failed?.detail ?? "elegible"}`;
}

console.log("Primera puerta que falla, último mes:");
for (const [key, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key.padEnd(12)} ${String(count).padStart(3)}   ${samples[key]}`);
}

const sample = [...buildPortfolio().values()][0];
const last = sample.months.at(-1);
console.log(`\nEjemplo completo — ${sample.meta.id} ${last.month}:`);
console.log(`  score ${last.score}  confianza ${last.confidence}  margen A1 ${last.contributions[0].raw}`);
console.log(`  capacidad adversa ${last.decision.adverseCapacity.toLocaleString("es-ES")} €/mes`);
console.log(`  límite capacidad ${last.decision.capacityLimit.toLocaleString("es-ES")} €`);
console.log(`  límite operativo ${last.decision.operatingLimit.toLocaleString("es-ES")} €`);
for (const gate of last.decision.gates) {
  console.log(`  ${gate.passed ? "ok  " : "FALLA"} ${gate.label}: ${gate.detail}`);
}
