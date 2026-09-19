import { availableMonths, getPortfolio } from "../lib/features/portfolio/source.ts";

console.log("mes       elegibles  mueven  abrir  ampliar  reducir  cierres reales");
for (const month of availableMonths().slice(6)) {
  const { rows } = getPortfolio({ month });
  const count = (fn) => rows.filter(fn).length;
  console.log(
    month,
    String(count((r) => r.eligible)).padStart(10),
    String(count((r) => r.changed)).padStart(7),
    String(count((r) => r.action === "abrir")).padStart(6),
    String(count((r) => r.action === "ampliar")).padStart(8),
    String(count((r) => r.action === "reducir")).padStart(8),
    String(count((r) => r.action === "cerrar" && r.previousLimit > 0)).padStart(15),
  );
}
