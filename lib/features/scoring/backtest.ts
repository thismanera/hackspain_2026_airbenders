import type { ScoreRow } from "@/lib/features/scoring/types";
import { median, monthIndex, percentile } from "@/lib/features/scoring/windows";

type Kind = "deterioro" | "recuperacion";
type Event = { company: string; month: string; index: number; kind: Kind };
type BacktestKind = {
  events: number;
  alerts: number;
  matched: number;
  recall: number | null;
  falseAlarmRate: number | null;
  leadMedian: number | null;
  leadP25: number | null;
};
export type BacktestReport = {
  forwardMarginSpearman: number | null;
  forwardMarginPairs: number;
  deterioro: BacktestKind;
  recuperacion: BacktestKind;
};
function eventAt(rows: ScoreRow[], index: number, kind: Kind): boolean {
  const next = rows.slice(index, index + 3);
  if (next.length < 3 || next.some((r) => r.deficitMes === null)) return false;
  if (kind === "deterioro")
    return (
      index >= 6 &&
      rows[index - 1].deficitMes === false &&
      rows.slice(index - 6, index).every((r) => r.deficitMes !== null) &&
      rows.slice(index - 6, index).filter((r) => r.deficitMes).length <= 1 &&
      next.every((r) => r.deficitMes)
    );
  return (
    index >= 3 &&
    rows[index - 1].deficitMes === true &&
    rows.slice(index - 3, index).every((r) => r.deficitMes !== null) &&
    rows.slice(index - 3, index).filter((r) => r.deficitMes).length >= 2 &&
    next.every((r) => r.deficitMes === false)
  );
}
function ranks(xs: number[]): number[] {
  const sorted = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const result = Array(xs.length).fill(0) as number[];
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && sorted[j][0] === sorted[i][0]) j++;
    for (let k = i; k < j; k++) result[sorted[k][1]] = (i + j - 1) / 2;
    i = j;
  }
  return result;
}
function spearman(pairs: [number, number][]): number | null {
  if (pairs.length < 2) return null;
  const x = ranks(pairs.map((p) => p[0])),
    y = ranks(pairs.map((p) => p[1]));
  const mx = x.reduce((a, b) => a + b, 0) / x.length,
    my = y.reduce((a, b) => a + b, 0) / y.length;
  let cov = 0,
    vx = 0,
    vy = 0;
  for (let i = 0; i < x.length; i++) {
    cov += (x[i] - mx) * (y[i] - my);
    vx += (x[i] - mx) ** 2;
    vy += (y[i] - my) ** 2;
  }
  return vx && vy ? cov / Math.sqrt(vx * vy) : null;
}
export function backtest(rows: ScoreRow[]): BacktestReport {
  const companies = new Map<string, ScoreRow[]>();
  for (const r of rows) {
    const list = companies.get(r.company) ?? [];
    list.push(r);
    companies.set(r.company, list);
  }
  const events: Event[] = [],
    pairs: [number, number][] = [];
  for (const [company, list] of companies) {
    list.sort((a, b) => a.month.localeCompare(b.month));
    for (let i = 0; i < list.length; i++) {
      for (const kind of ["deterioro", "recuperacion"] as const)
        if (eventAt(list, i, kind)) events.push({ company, month: list[i].month, index: i, kind });
      if (i + 3 < list.length && list[i + 3].margenMes !== null)
        pairs.push([list[i].score, list[i + 3].margenMes!]);
    }
  }
  const report: BacktestReport = {
    forwardMarginSpearman: spearman(pairs),
    forwardMarginPairs: pairs.length,
    deterioro: {
      events: 0,
      alerts: 0,
      matched: 0,
      recall: null,
      falseAlarmRate: null,
      leadMedian: null,
      leadP25: null,
    },
    recuperacion: {
      events: 0,
      alerts: 0,
      matched: 0,
      recall: null,
      falseAlarmRate: null,
      leadMedian: null,
      leadP25: null,
    },
  };
  for (const kind of ["deterioro", "recuperacion"] as const) {
    const relevant = events.filter((e) => e.kind === kind),
      leads: number[] = [];
    let matched = 0,
      falseAlarms = 0,
      alerts = 0;
    for (const e of relevant) {
      const list = companies.get(e.company)!;
      const candidates = list
        .slice(Math.max(0, e.index - 6), e.index)
        .flatMap((r) => r.alertas.map((a) => ({ ...a, mes: r.month })))
        .filter((a) => a.tipo === kind && a.mes < e.month);
      if (candidates.length) {
        matched++;
        const first = candidates.sort((a, b) => a.desdeMes.localeCompare(b.desdeMes))[0];
        leads.push(e.index - monthIndex(first.desdeMes));
      }
    }
    for (const [company, list] of companies)
      for (let i = 0; i + 6 < list.length; i++) {
        const emitted = list[i].alertas.some(
          (a) => a.tipo === kind && !list[i - 1]?.alertas.some((p) => p.tipo === kind),
        );
        if (!emitted) continue;
        alerts++;
        if (!relevant.some((e) => e.company === company && e.index > i && e.index <= i + 6))
          falseAlarms++;
      }
    report[kind] = {
      events: relevant.length,
      alerts,
      matched,
      recall: relevant.length ? matched / relevant.length : null,
      falseAlarmRate: alerts ? falseAlarms / alerts : null,
      leadMedian: median(leads),
      leadP25: leads.length ? percentile(leads, 0.25) : null,
    };
  }
  return report;
}
