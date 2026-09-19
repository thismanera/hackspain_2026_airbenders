import type { IndicatorFormat } from "./indicators";

const eur0 = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const eur2 = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});
const compactEur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});
const pct0 = new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 1 });
const dec1 = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dec2 = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const int0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const MONTHS_ES_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function formatEuros(value: number): string {
  return eur0.format(value);
}

export function formatEurosExact(value: number): string {
  return eur2.format(value);
}

/** Para ejes de gráfico y celdas muy estrechas: 148 mil €, 1,2 M €. */
export function formatEurosCompact(value: number): string {
  return compactEur.format(value);
}

export function formatPercent(value: number, decimals: 0 | 1 = 1): string {
  return (decimals === 0 ? pct0 : pct1).format(value);
}

export function formatRatio(value: number): string {
  return `${dec2.format(value)}×`;
}

export function formatDays(value: number): string {
  const rounded = Math.round(value);
  return `${int0.format(rounded)} ${Math.abs(rounded) === 1 ? "día" : "días"}`;
}

export function formatMonths(value: number): string {
  const rounded = Math.round(value);
  return `${int0.format(rounded)} ${Math.abs(rounded) === 1 ? "mes" : "meses"}`;
}

export function formatScore(value: number): string {
  return int0.format(Math.round(value));
}

/** Delta con signo explícito. El signo es parte del dato, no decoración. */
/** Un decimal, sin signo: para "baja 0,5 puntos", donde el verbo ya lleva el sentido. */
export function formatDecimal(value: number): string {
  return dec1.format(value);
}

export function formatSigned(value: number, decimals: 0 | 1 = 1): string {
  const formatted = decimals === 0 ? int0.format(Math.round(value)) : dec1.format(value);
  return value > 0 ? `+${formatted}` : formatted;
}

export function formatApr(value: number): string {
  return `${dec1.format(value)} %`;
}

/** "2026-08" → "agosto de 2026". */
export function formatMonthLong(month: string): string {
  const [year, index] = month.split("-");
  return `${MONTHS_ES[Number(index) - 1]} de ${year}`;
}

/** "2026-08" → "ago 2026". Para selectores y ejes. */
export function formatMonthShort(month: string): string {
  const [year, index] = month.split("-");
  return `${MONTHS_ES_SHORT[Number(index) - 1]} ${year}`;
}

/** "2026-08" → "ago". Para el eje X de series largas. */
export function formatMonthTick(month: string): string {
  const [year, index] = month.split("-");
  const label = MONTHS_ES_SHORT[Number(index) - 1];
  return index === "01" ? `${label} ${year.slice(2)}` : label;
}

/** Valor bruto de un indicador, en la unidad que le corresponde. */
export function formatIndicatorValue(value: number | null, format: IndicatorFormat): string {
  if (value === null) return "Sin dato";
  switch (format) {
    case "percent":
      return formatPercent(value);
    case "ratio":
      return formatRatio(value);
    case "days":
      return formatDays(value);
    case "months":
      return formatMonths(value);
  }
}
