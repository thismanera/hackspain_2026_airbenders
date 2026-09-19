import { PARAMS } from "@/lib/features/scoring/params";

/** Meses del calendario de análisis, de `PARAMS.mesInicio` a `PARAMS.mesFin` (ambos inclusive). */
export const CALENDAR: readonly string[] = (() => {
  const [yInicio, mInicio] = PARAMS.mesInicio.split("-").map(Number);
  const [yFin, mFin] = PARAMS.mesFin.split("-").map(Number);
  const out: string[] = [];
  for (let y = yInicio, m = mInicio; y < yFin || (y === yFin && m <= mFin); m++) {
    if (m === 13) {
      y++;
      m = 1;
    }
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
})();

export function monthIndex(month: string): number {
  return CALENDAR.indexOf(month);
}

export function endOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  return (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2;
}

export function mad(xs: number[]): number | null {
  const m = median(xs);
  if (m === null) return null;
  return median(xs.map((x) => Math.abs(x - m)));
}

/** Percentil interpolado; null si no hay muestras (el llamante decide el respaldo). */
export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const i = (a.length - 1) * p;
  const k = Math.floor(i);
  return a[k] + (a[Math.min(k + 1, a.length - 1)] - a[k]) * (i - k);
}

export function clamp(n: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, n));
}

export function divide(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

/** Slots de calendario t-n+1..t; undefined donde no hay elemento. */
export function window<T>(items: readonly (T | undefined)[], t: number, n: number): (T | undefined)[] {
  const out: (T | undefined)[] = [];
  for (let i = t - n + 1; i <= t; i++) out.push(i >= 0 ? items[i] : undefined);
  return out;
}
