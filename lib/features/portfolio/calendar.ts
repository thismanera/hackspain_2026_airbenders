/**
 * Ventana de meses que cubre el panel, en un módulo sin dependencias para que el
 * cliente pueda importarla sin arrastrar el generador de datos al bundle.
 *
 * Septiembre de 2026 queda fuera a propósito: el dataset lo tiene truncado y
 * puntuarlo daría una caída falsa en toda la cartera (analysis/FINDINGS.md).
 */
export const CALENDAR: string[] = (() => {
  const months: string[] = [];
  for (let year = 2024, month = 9; months.length < 24; ) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
})();

export const LATEST_MONTH = CALENDAR[CALENDAR.length - 1];
