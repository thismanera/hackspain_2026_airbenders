/**
 * Materialización del contrato del panel. La importación recorre el `Dataset`
 * una vez y deja en `portfolio_snapshots` cada respuesta ya consolidada; en
 * producción cada petición es una lectura indexada de una fila JSON, sin cargar
 * las 30k filas del run en memoria ni recalcular nada.
 *
 * Sin I/O en ambos sentidos (`materialize` produce filas, `*FromSnapshot`
 * reconstruye respuestas): los tests comparan contra las funciones puras de
 * `derive.ts` con el generador de fixtures.
 */
import { CALENDAR } from "./calendar";
import type { Dataset } from "./dataset";
import {
  alertsFrom,
  backtestFrom,
  benchmarkAgainst,
  cohortAt,
  groupFileFrom,
  groupPeersAt,
  groupsFrom,
  hasFilters,
  liteRow,
  matches,
  portfolioFrom,
  summarise,
  type CohortStats,
  type PortfolioFilters,
  type PortfolioLiteRow,
} from "./derive";
import { peerMapFrom } from "./peer-map";
import { readingsFor } from "./reading";
import type {
  BenchmarkResponse,
  CompanyFileResponse,
  CompanyMeta,
  EngineMetrics,
  GroupPeer,
  MonthScore,
  PortfolioListRow,
  PortfolioResponse,
  PortfolioRow,
  PortfolioSnapshotPayload,
} from "./types";

export const SNAPSHOT_KIND = {
  meta: "meta",
  portfolio: "portfolio",
  portfolioLite: "portfolio-lite",
  company: "company",
  group: "group",
  groups: "groups",
  alerts: "alerts",
  backtest: "backtest",
  cohort: "cohort",
  peers: "peers",
  reading: "reading",
} as const;

export type SnapshotKind = (typeof SNAPSHOT_KIND)[keyof typeof SNAPSHOT_KIND];

const META_KEY = "run";

type MetaSnapshot = {
  engine: EngineMetrics | null;
  companies: number;
  months: string[];
  materializedAt: string;
};

/** Toda la serie de la empresa; la ficha de un mes concreto se recorta al leer. */
export type CompanySnapshot = {
  company: CompanyMeta;
  history: MonthScore[];
  peersByMonth: Record<string, GroupPeer[]>;
};

export type SnapshotRow = { kind: SnapshotKind; key: string; payload: unknown };

export function readingKey(companyId: string, month: string): string {
  return `${companyId}:${month}`;
}

export function groupKey(groupId: string, month: string): string {
  return `${groupId}:${month}`;
}

/** Recorre el dataset y produce cada fila materializada, en orden estable. */
export function* materialize(
  dataset: Dataset,
  materializedAt: Date = new Date(),
): Generator<SnapshotRow> {
  const groups = new Set<string>();
  for (const entry of dataset.companies.values()) groups.add(entry.meta.groupId);

  for (const month of CALENDAR) {
    const portfolio = portfolioFrom(dataset, { month });
    yield { kind: SNAPSHOT_KIND.portfolio, key: month, payload: portfolio };
    yield { kind: SNAPSHOT_KIND.portfolioLite, key: month, payload: portfolio.rows.map(liteRow) };
    yield { kind: SNAPSHOT_KIND.groups, key: month, payload: groupsFrom(dataset, month) };
    yield { kind: SNAPSHOT_KIND.alerts, key: month, payload: alertsFrom(dataset, month) };
    yield { kind: SNAPSHOT_KIND.backtest, key: month, payload: backtestFrom(dataset, month) };
    yield { kind: SNAPSHOT_KIND.cohort, key: month, payload: cohortAt(dataset.companies, month) };
    yield {
      kind: SNAPSHOT_KIND.peers,
      key: month,
      payload: peerMapFrom(dataset, { month, scope: "partner" }),
    };
    for (const groupId of groups) {
      const group = groupFileFrom(dataset, groupId, month);
      if (group) yield { kind: SNAPSHOT_KIND.group, key: groupKey(groupId, month), payload: group };
    }
  }

  for (const entry of dataset.companies.values()) {
    const peersByMonth: Record<string, GroupPeer[]> = {};
    for (const point of entry.months)
      peersByMonth[point.month] = groupPeersAt(dataset.companies, entry, point.month);
    const payload: CompanySnapshot = { company: entry.meta, history: entry.months, peersByMonth };
    yield { kind: SNAPSHOT_KIND.company, key: entry.meta.id, payload };

    for (const point of entry.months) {
      const file = companyFileFromSnapshot(payload, point.month);
      if (!file) continue;
      yield {
        kind: SNAPSHOT_KIND.reading,
        key: readingKey(entry.meta.id, point.month),
        payload: readingsFor(file, dataset.parameterVersion),
      };
    }
  }

  const meta: MetaSnapshot = {
    engine: dataset.engine,
    companies: dataset.companies.size,
    months: CALENDAR,
    materializedAt: materializedAt.toISOString(),
  };
  yield { kind: SNAPSHOT_KIND.meta, key: META_KEY, payload: meta };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function roundNullable(value: number | null, decimals: number): number | null {
  return value === null ? null : round(value, decimals);
}

/** Lo que la tabla y el mapa pintan de una fila, con la precisión que se muestra. */
export function listRow(row: PortfolioRow): PortfolioListRow {
  const { reason: _reason, spark: _spark, ...rest } = row;
  return {
    ...rest,
    score: round(row.score, 2),
    confidence: round(row.confidence, 3),
    trend3m: roundNullable(row.trend3m, 2),
    share: round(row.share, 3),
    trail: row.trail.map((point) => ({
      month: point.month,
      score: round(point.score, 2),
      trend3m: round(point.trend3m, 2),
    })),
  };
}

/**
 * La cartera materializada, recortada a lo que viaja al navegador. La fila
 * completa (motivo, sparkline, decimales de coma flotante) triplica el JSON de
 * una cartera de 1.300 empresas, y solo el CSV la necesita entera.
 */
export function leanPortfolio(full: PortfolioSnapshotPayload): PortfolioResponse {
  return { ...full, rows: full.rows.map(listRow) };
}

/**
 * Cartera con filtros a partir de la cartera completa del mes y las filas
 * ligeras de los meses anteriores (solo hacen falta si hay filtro: la historia
 * arrastra el mismo filtro que la tabla).
 */
export function portfolioFromSnapshot<T extends PortfolioResponse | PortfolioSnapshotPayload>(
  full: T,
  filters: PortfolioFilters,
  liteByMonth: (month: string) => PortfolioLiteRow[],
): T {
  if (!hasFilters(filters)) return full;
  const keep = matches(filters);
  const rows = full.rows.filter(keep);
  const history = CALENDAR.slice(0, CALENDAR.indexOf(full.month) + 1).map((past) =>
    past === full.month
      ? summarise(full.month, rows)
      : summarise(past, liteByMonth(past).filter(keep)),
  );
  return {
    ...full,
    summary: history[history.length - 1],
    previous: history.length > 1 ? history[history.length - 2] : null,
    history,
    rows,
  };
}

export function companyFileFromSnapshot(
  snapshot: CompanySnapshot,
  month: string,
): CompanyFileResponse | null {
  const index = snapshot.history.findIndex((point) => point.month === month);
  if (index === -1) return null;
  return {
    company: snapshot.company,
    month,
    months: CALENDAR,
    latest: snapshot.history[index],
    previous: index > 0 ? snapshot.history[index - 1] : null,
    history: snapshot.history.slice(0, index + 1),
    peers: snapshot.peersByMonth[month] ?? [],
  };
}

export function benchmarkFromSnapshot(
  snapshot: CompanySnapshot,
  cohort: CohortStats,
): BenchmarkResponse | null {
  const mine = snapshot.history.find((point) => point.month === cohort.month);
  return mine ? benchmarkAgainst(mine, cohort) : null;
}
