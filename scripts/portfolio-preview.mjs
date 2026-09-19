/** Vistazo rápido a la cartera de demostración. `node --import tsx scripts/portfolio-preview.mjs` */
import { getCompanyFile, getPortfolio } from "../lib/features/portfolio/source.ts";

const { rows, summary } = getPortfolio();

console.log("Estados:", summary.byEstado);
console.log("Exposición:", Math.round(summary.exposure).toLocaleString("es-ES"), "€");
console.log("Con movimiento:", summary.moved, "de", summary.total);

const actions = {};
const bands = {};
for (const row of rows) {
  actions[row.action] = (actions[row.action] ?? 0) + 1;
  bands[row.band] = (bands[row.band] ?? 0) + 1;
}
console.log("Acciones:", actions);
console.log("Bandas:", bands);

console.log("\nPrimeras 12 filas (orden por atención):");
for (const row of rows.slice(0, 12)) {
  console.log(
    [
      row.company.id.padEnd(10),
      row.estado.padEnd(10),
      String(Math.round(row.score)).padStart(3),
      `conf ${String(Math.round(row.confidence * 100)).padStart(3)}%`,
      row.band,
      row.action.padEnd(9),
      `${Math.round(row.limit).toLocaleString("es-ES")} €`.padStart(12),
      `${row.alertCount} alertas`,
    ].join("  "),
  );
}

const withGap = rows
  .map((row) => getCompanyFile(row.company.id))
  .flatMap((file) => file.latest.alerts.map((alert) => ({ company: file.company.id, alert })))
  .map((entry) => ({
    ...entry,
    lead:
      new Date(`${entry.alert.confirmedMonth}-01`).getMonth() -
      new Date(`${entry.alert.onsetMonth}-01`).getMonth(),
  }))
  .sort((a, b) => b.lead - a.lead)
  .slice(0, 5);

console.log("\nAlertas con más anticipación entre detección y confirmación:");
for (const entry of withGap) {
  console.log(
    `  ${entry.company}  ${entry.alert.onsetMonth} → ${entry.alert.confirmedMonth}  ${entry.alert.label}`,
  );
}

const thin = rows.filter((row) => row.estado === "sin_datos").slice(0, 3);
console.log("\nEmpresas sin datos suficientes:", thin.map((row) => row.company.id).join(", ") || "ninguna");
