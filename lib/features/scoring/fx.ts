import { median } from "@/lib/features/scoring/windows";

export type FxTable = Record<string, Record<string, number>>; // moneda → mes → € por 1 unidad
export type FxObservation = { currency: string; accounting: string; rate: number; month: string };

/** Tasa fija de respaldo (€ por 1 unidad), aproximación 2025-26. Forma parte de los parámetros versionados. */
export const FX_FALLBACK: Record<string, number> = {
  EUR: 1,
  USD: 0.86,
  GBP: 1.16,
  CHF: 1.06,
  DKK: 0.134,
  NOK: 0.088,
  SEK: 0.09,
  AUD: 0.58,
  CAD: 0.63,
  NZD: 0.53,
  MXN: 0.048,
  BRL: 0.16,
  COP: 0.00022,
  CLP: 0.00095,
  ARS: 0.0008,
  BAM: 0.51,
  PLN: 0.235,
  CZK: 0.04,
  HUF: 0.0025,
  RON: 0.2,
  TRY: 0.024,
};

export function buildFxTable(rows: FxObservation[]): FxTable {
  const samples: Record<string, Record<string, number[]>> = {};
  for (const r of rows) {
    if (!(r.rate > 0)) continue;
    let currency: string, eurPerUnit: number;
    if (r.accounting === "EUR" && r.currency !== "EUR") {
      currency = r.currency;
      eurPerUnit = 1 / r.rate; // rate = unidades de currency por 1 EUR
    } else if (r.currency === "EUR" && r.accounting !== "EUR") {
      currency = r.accounting;
      eurPerUnit = r.rate; // rate = EUR por 1 unidad de accounting
    } else continue;
    ((samples[currency] ??= {})[r.month] ??= []).push(eurPerUnit);
  }
  const table: FxTable = {};
  for (const [currency, byMonth] of Object.entries(samples))
    for (const [month, xs] of Object.entries(byMonth))
      (table[currency] ??= {})[month] = median(xs)!;
  return table;
}

export function eurRate(fx: FxTable, currency: string, month: string): number | null {
  if (currency === "EUR") return 1;
  return fx[currency]?.[month] ?? FX_FALLBACK[currency] ?? null;
}

/**
 * amount: importe en la moneda del producto/factura. rate: exchange_rate del CSV (unidades de esa
 * moneda por 1 unidad de la moneda de la empresa) o null si vacío/0.
 */
export function toEur(
  fx: FxTable,
  amount: number,
  rate: number | null,
  productCurrency: string,
  companyCurrency: string,
  month: string,
): number | null {
  const companyEur = eurRate(fx, companyCurrency, month);
  if (companyEur === null) return null;
  let r = rate && rate > 0 ? rate : null;
  if (r === null) {
    if (productCurrency === companyCurrency) r = 1;
    else {
      const productEur = eurRate(fx, productCurrency, month);
      if (productEur === null) return null;
      r = companyEur / productEur;
    }
  }
  return (amount / r) * companyEur;
}
