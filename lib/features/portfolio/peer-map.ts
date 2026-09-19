/**
 * Espacio de pares: PCA sobre los 14 subscores persistidos y un k-means por
 * mes. Puro como `derive.ts`; el ajuste se memoriza por `Dataset` (WeakMap) y
 * cae solo cuando el loader entrega otra ejecución.
 */
import { CALENDAR, LATEST_MONTH } from "./calendar";
import type { CompanyDataset } from "./dataset";
import type { SourceDataset } from "./derive";
import { INDICATORS } from "./indicators";
import {
  clusterLabel,
  dominantTraits,
  kmeans,
  pcaFit,
  projectRow,
  standardizeRow,
  type PcaFit,
} from "./peers";
import type { MonthScore, PeerCluster, PeerMapResponse, PeerPoint, Scope, Vec3 } from "./types";

const PEER_CLUSTERS = 5;
const PEER_SEED = 20260919;
const PEER_TRAIL_MONTHS = 12;
const INDICATOR_IDS = INDICATORS.map((meta) => meta.id);

type PeerMonth = {
  assignment: Map<string, number>;
  clusters: PeerCluster[];
  centroids: number[][];
};

type PeerSpace = {
  fit: PcaFit;
  /** Coordenadas por empresa y mes del calendario; `null` = sin datos ese mes. */
  coords: Map<string, (Vec3 | null)[]>;
  /** Un k-means por mes, cada uno arrancado desde los centroides del anterior. */
  months: PeerMonth[];
};

const spaceCache = new WeakMap<SourceDataset["companies"], PeerSpace>();

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const roundVec = (v: readonly number[]): Vec3 => [round3(v[0]), round3(v[1]), round3(v[2])];

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Los 14 subscores en el orden de `INDICATORS`; sin dato = `null`, nunca el 50 centinela. */
function subscoresOf(month: MonthScore): (number | null)[] {
  return INDICATORS.map((meta) => {
    const entry = month.contributions.find((item) => item.indicator === meta.id);
    return entry && entry.raw !== null ? entry.subscore : null;
  });
}

/** Serie alineada al calendario: la ejecución real no garantiza todos los meses por empresa. */
function byCalendar(entry: CompanyDataset): (MonthScore | null)[] {
  const byMonth = new Map(entry.months.map((point) => [point.month, point]));
  return CALENDAR.map((month) => byMonth.get(month) ?? null);
}

function hasData(month: MonthScore | null): month is MonthScore {
  return month !== null && month.coverage.observedMonths > 0;
}

/**
 * Ajuste único para toda la cartera y todos los meses. Los ejes no cambian de
 * un mes a otro: por eso la estela de una empresa es un camino y no ruido.
 */
function peerSpace(companies: SourceDataset["companies"]): PeerSpace {
  const cached = spaceCache.get(companies);
  if (cached) return cached;

  const series = new Map([...companies].map(([id, entry]) => [id, byCalendar(entry)]));
  const ids = [...series.keys()];

  const rows: (number | null)[][] = [];
  for (const months of series.values()) {
    for (const month of months) if (hasData(month)) rows.push(subscoresOf(month));
  }
  const fit = pcaFit(rows, 3);

  const coords = new Map<string, (Vec3 | null)[]>();
  for (const [id, months] of series) {
    coords.set(
      id,
      months.map((month) =>
        hasData(month) ? roundVec(projectRow(fit, subscoresOf(month))) : null,
      ),
    );
  }

  const months: PeerMonth[] = [];
  let previous: number[][] | undefined;
  CALENDAR.forEach((_, index) => {
    const present = ids.filter((id) => coords.get(id)![index] !== null);
    const points = present.map((id) => [...coords.get(id)![index]!]);
    let result = kmeans(points, PEER_CLUSTERS, PEER_SEED, previous);

    if (!previous && result.centroids.length > 0) {
      // Primer mes: ids por PC1 del centroide, de menos sano a más sano.
      const order = result.centroids
        .map((centroid, i) => ({ centroid, i }))
        .sort((a, b) => a.centroid[0] - b.centroid[0])
        .map((entry) => entry.i);
      const remap = new Map(order.map((old, fresh) => [old, fresh]));
      result = {
        labels: result.labels.map((label) => remap.get(label)!),
        centroids: order.map((i) => result.centroids[i]),
        inertia: result.inertia,
      };
    }
    if (result.centroids.length === PEER_CLUSTERS) previous = result.centroids;

    const assignment = new Map(present.map((id, i) => [id, result.labels[i]]));
    const clusters: PeerCluster[] = result.centroids.map((centroid, c) => {
      const members = present.filter((_, i) => result.labels[i] === c);
      const memberMonths = members.map((id) => series.get(id)![index]!);
      const memberZ = memberMonths.map((month) =>
        standardizeRow(subscoresOf(month), fit.mean, fit.std),
      );
      return {
        id: c,
        label: clusterLabel(dominantTraits(memberZ, INDICATOR_IDS)),
        size: members.length,
        medianScore: median(memberMonths.map((month) => month.score)),
        centroid: roundVec(centroid),
      };
    });
    months.push({ assignment, clusters, centroids: result.centroids });
  });

  const space = { fit, coords, months };
  spaceCache.set(companies, space);
  return space;
}

function monthIndexOf(requestedMonth?: string): { month: string; index: number } {
  const month = requestedMonth && CALENDAR.includes(requestedMonth) ? requestedMonth : LATEST_MONTH;
  return { month, index: CALENDAR.indexOf(month) };
}

/**
 * El cubo de pares a cierre de un mes. `scope` decide quién lleva nombre: el
 * partner ve a todas (hasta que llegue el opt-in de servidor; entonces esta es
 * la única línea que cambia), la empresa solo se ve a sí misma.
 */
export function peerMapFrom(
  dataset: SourceDataset,
  input: { month?: string; scope: Scope; company?: string },
): PeerMapResponse {
  const { month, index } = monthIndexOf(input.month);
  const { companies } = dataset;
  const space = peerSpace(companies);
  const focus = input.company && companies.has(input.company) ? input.company : null;
  const start = Math.max(0, index - (PEER_TRAIL_MONTHS - 1));
  const months = CALENDAR.slice(start, index + 1);
  const monthData = space.months[index];

  const canName = (id: string) => (input.scope === "partner" ? true : id === focus);

  const points: PeerPoint[] = [...companies.entries()].map(([id, entry], i) => {
    const all = space.coords.get(id)!;
    const series = byCalendar(entry);
    const current = series[index];
    const first = series[start];
    const named = canName(id);
    const now = hasData(current);
    return {
      company: named ? id : null,
      key: named ? id : `anon-${i}`,
      pos: all[index],
      estado: current?.estado ?? "sin_datos",
      score: named && now ? current.score : null,
      deltaTrail:
        named && now && start < index && hasData(first)
          ? Math.round((current.score - first.score) * 10) / 10
          : null,
      cluster: monthData.assignment.get(id) ?? null,
      trail: all.slice(start, index + 1),
    };
  });

  const axes = space.fit.components.map((component, c) => ({
    explained: round3(space.fit.explained[c]),
    top: INDICATOR_IDS.map((indicator, j) => ({
      indicator,
      loading: Math.round(component[j] * 100) / 100,
    }))
      .sort((a, b) => Math.abs(b.loading) - Math.abs(a.loading))
      .slice(0, 3),
  })) as PeerMapResponse["axes"];

  return { month, months, axes, clusters: monthData.clusters, points, focus };
}
