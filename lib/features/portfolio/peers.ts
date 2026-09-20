/**
 * Espacio de pares. Cada empresa-mes es su vector de 14 subscores (0-100): el
 * "embedding" que ya construye el scoring, con la ventaja de que cada dimensión
 * tiene nombre. PCA para verlo en tres ejes; k-means para agruparlo. Todo
 * determinista y sin dependencias: misma entrada, misma salida.
 *
 * El ajuste se hace una sola vez sobre todas las empresas y todos los meses.
 * Si se ajustase mes a mes, los ejes girarían entre meses y la estela de una
 * empresa no significaría nada.
 */
import { indicator } from "./indicators";
import type { Vec3 } from "./types";

const EPSILON = 1e-6;

/* ------------------------------------------------------------------ *
 * Estandarización
 * ------------------------------------------------------------------ */

type Standardized = { z: number[][]; mean: number[]; std: number[] };

/**
 * Media y desviación por columna solo sobre los valores presentes: un `null` es
 * "no hay dato", no un 50. Tras estandarizar, el nulo vale 0 (la media).
 */
export function standardize(rows: readonly (readonly (number | null)[])[]): Standardized {
  const dims = rows[0]?.length ?? 0;
  const mean = new Array<number>(dims).fill(0);
  const std = new Array<number>(dims).fill(1);
  for (let j = 0; j < dims; j++) {
    const values = rows.map((row) => row[j]).filter((v): v is number => v !== null);
    if (values.length === 0) continue;
    mean[j] = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + (v - mean[j]) ** 2, 0) / Math.max(1, values.length - 1);
    std[j] = Math.sqrt(variance);
  }
  return { z: rows.map((row) => standardizeRow(row, mean, std)), mean, std };
}

export function standardizeRow(
  row: readonly (number | null)[],
  mean: readonly number[],
  std: readonly number[],
): number[] {
  return row.map((value, j) => {
    if (value === null || std[j] < EPSILON) return 0;
    return (value - mean[j]) / std[j];
  });
}

/* ------------------------------------------------------------------ *
 * PCA por iteración de potencia con deflación
 * ------------------------------------------------------------------ */

export type PcaFit = {
  mean: number[];
  std: number[];
  /** Vectores unitarios y ortogonales, uno por componente. */
  components: number[][];
  /** Fracción de la varianza total que explica cada componente. */
  explained: number[];
  /** Máximo |coordenada| por componente sobre todas las filas; escala a [-1, 1]. */
  maxAbs: number[];
};

function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function covariance(z: readonly number[][]): number[][] {
  const n = z.length;
  const dims = z[0]?.length ?? 0;
  const cov = Array.from({ length: dims }, () => new Array<number>(dims).fill(0));
  for (const row of z) {
    for (let i = 0; i < dims; i++) {
      if (row[i] === 0) continue;
      for (let j = 0; j < dims; j++) cov[i][j] += row[i] * row[j];
    }
  }
  const denominator = Math.max(1, n - 1);
  return cov.map((row) => row.map((value) => value / denominator));
}

function multiply(m: readonly number[][], v: readonly number[]): number[] {
  return m.map((row) => dot(row, v));
}

/**
 * Autovector dominante de `m`, ortogonal a `previous`. Gram-Schmidt en cada
 * iteración para que el redondeo no lo devuelva hacia las componentes ya sacadas.
 */
function dominantEigenvector(m: readonly number[][], previous: readonly number[][]) {
  const dims = m.length;
  let v = new Array<number>(dims).fill(1 / Math.sqrt(dims));
  for (let iteration = 0; iteration < 500; iteration++) {
    let next = multiply(m, v);
    for (const p of previous) {
      const projection = dot(next, p);
      next = next.map((value, i) => value - projection * p[i]);
    }
    const norm = Math.sqrt(dot(next, next));
    if (norm < EPSILON) return { vector: v, value: 0 };
    next = next.map((value) => value / norm);
    const shift = Math.sqrt(next.reduce((sum, value, i) => sum + (value - v[i]) ** 2, 0));
    v = next;
    if (shift < 1e-10) break;
  }
  return { vector: v, value: dot(v, multiply(m, v)) };
}

export function pcaFit(rows: readonly (readonly (number | null)[])[], k = 3): PcaFit {
  const { z, mean, std } = standardize(rows);
  const dims = mean.length;
  const cov = covariance(z);
  const trace = cov.reduce((sum, row, i) => sum + row[i], 0) || 1;

  const components: number[][] = [];
  const explained: number[] = [];
  let deflated = cov;
  for (let c = 0; c < k; c++) {
    const { vector, value } = dominantEigenvector(deflated, components);
    components.push(orient(vector, c));
    explained.push(Math.max(0, value) / trace);
    deflated = deflated.map((row, i) => row.map((entry, j) => entry - value * vector[i] * vector[j]));
  }

  const maxAbs = components.map((component) =>
    Math.max(EPSILON, ...z.map((row) => Math.abs(dot(row, component)))),
  );

  return { mean: mean.slice(0, dims), std, components, explained, maxAbs };
}

/**
 * Signo estable. PC1 apunta a "más sano": los subscores ya están orientados así,
 * luego la suma de cargas tiene que ser positiva. En el resto, la carga de mayor
 * módulo es positiva.
 */
function orient(vector: number[], componentIndex: number): number[] {
  const pivot =
    componentIndex === 0
      ? vector.reduce((sum, value) => sum + value, 0)
      : vector.reduce((best, value) => (Math.abs(value) > Math.abs(best) ? value : best), 0);
  return pivot < 0 ? vector.map((value) => -value) : vector;
}

/** Coordenadas en [-1, 1]³ de una fila de subscores (nulos imputados a la media). */
export function projectRow(fit: PcaFit, subscores: readonly (number | null)[]): Vec3 {
  const z = standardizeRow(subscores, fit.mean, fit.std);
  const coords = fit.components.map((component, c) =>
    Math.max(-1, Math.min(1, dot(z, component) / fit.maxAbs[c])),
  );
  return [coords[0] ?? 0, coords[1] ?? 0, coords[2] ?? 0];
}

/* ------------------------------------------------------------------ *
 * k-means
 * ------------------------------------------------------------------ */

/** mulberry32, el mismo generador que usan las fixtures. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distance2(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return sum;
}

type KMeansResult = { labels: number[]; centroids: number[][]; inertia: number };

function seedPlusPlus(points: readonly number[][], k: number, rand: () => number): number[][] {
  const centroids: number[][] = [points[Math.floor(rand() * points.length)].slice()];
  while (centroids.length < k) {
    const weights = points.map((p) => Math.min(...centroids.map((c) => distance2(p, c))));
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (total < EPSILON) {
      centroids.push(points[centroids.length % points.length].slice());
      continue;
    }
    let r = rand() * total;
    let pick = points.length - 1;
    for (let i = 0; i < points.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    centroids.push(points[pick].slice());
  }
  return centroids;
}

function lloyd(points: readonly number[][], initial: readonly number[][]): KMeansResult {
  const k = initial.length;
  let centroids = initial.map((c) => c.slice());
  let labels = new Array<number>(points.length).fill(-1);
  for (let iteration = 0; iteration < 50; iteration++) {
    const next = points.map((p) => {
      let best = 0;
      let bestDistance = Infinity;
      for (let c = 0; c < k; c++) {
        const d = distance2(p, centroids[c]);
        if (d < bestDistance) {
          bestDistance = d;
          best = c;
        }
      }
      return best;
    });
    const changed = next.some((label, i) => label !== labels[i]);
    labels = next;
    for (let c = 0; c < k; c++) {
      const members = points.filter((_, i) => labels[i] === c);
      if (members.length === 0) {
        // Cluster vacío: se lleva al punto más alejado de su centroide actual.
        const farthest = points.reduce(
          (best, p, i) => {
            const d = distance2(p, centroids[labels[i]]);
            return d > best.d ? { d, i } : best;
          },
          { d: -1, i: 0 },
        );
        centroids[c] = points[farthest.i].slice();
        labels[farthest.i] = c;
        continue;
      }
      centroids[c] = members[0].map((_, axis) => members.reduce((sum, m) => sum + m[axis], 0) / members.length);
    }
    if (!changed && iteration > 0) break;
  }
  const inertia = points.reduce((sum, p, i) => sum + distance2(p, centroids[labels[i]]), 0);
  return { labels, centroids, inertia };
}

/**
 * k-means determinista. Sin `initial`: k-means++ con semilla y 8 reinicios,
 * gana la menor inercia. Con `initial`: una sola pasada desde esos centroides,
 * y el cluster `c` conserva el índice `c` (arranque en caliente entre meses).
 */
export function kmeans(
  points: readonly number[][],
  k: number,
  seed: number,
  initial?: readonly number[][],
): KMeansResult {
  if (points.length === 0) return { labels: [], centroids: [], inertia: 0 };
  const effectiveK = Math.min(k, points.length);
  if (initial && initial.length === effectiveK) return lloyd(points, initial);

  const rand = mulberry32(seed);
  let best: KMeansResult | null = null;
  for (let restart = 0; restart < 8; restart++) {
    const result = lloyd(points, seedPlusPlus(points, effectiveK, rand));
    if (!best || result.inertia < best.inertia) best = result;
  }
  return best!;
}

/* ------------------------------------------------------------------ *
 * Etiquetas
 * ------------------------------------------------------------------ */

/**
 * Cómo se lee que un grupo esté por encima o por debajo de la media en cada
 * variable. Los subscores ya están orientados: "above" siempre es lo bueno.
 */
export const PEER_LABELS = {
  A1: { above: "con colchón de caja", below: "sin colchón de caja" },
  A2: { above: "casi nunca en déficit", below: "meses en déficit" },
  A3: { above: "cubren la deuda", below: "deuda apretada" },
  A4: { above: "poca deuda", below: "muy endeudadas" },
  A5: { above: "viven sin crédito", below: "dependen del crédito" },
  B1: { above: "cumplen sus pagos", below: "fallan pagos" },
  B2: { above: "al día", below: "arrastran retraso" },
  B3: { above: "pagan puntual a proveedores", below: "pagan tarde a proveedores" },
  C1: { above: "clientes repartidos", below: "pocos clientes" },
  C2: { above: "proveedores repartidos", below: "pocos proveedores" },
  C3: { above: "cobran pronto", below: "cobran tarde" },
  C4: { above: "poco vencido", below: "mucho vencido sin cobrar" },
  C5: { above: "cobros estables", below: "cobros volátiles" },
  C6: { above: "sin devoluciones", below: "recibos devueltos" },
} satisfies Record<string, { above: string; below: string }>;

/** Lectura de un indicador por su id, o `undefined` si no está en el catálogo. */
export function peerLabel(id: string): { above: string; below: string } | undefined {
  return (PEER_LABELS as Record<string, { above: string; below: string } | undefined>)[id];
}

type ClusterTrait = { indicator: string; above: boolean };

export function clusterLabel(traits: readonly ClusterTrait[]): string {
  const parts = traits
    .map((trait) => {
      const entry = peerLabel(trait.indicator) ?? fallbackLabel(trait.indicator);
      return entry ? entry[trait.above ? "above" : "below"] : null;
    })
    .filter((part): part is string => part !== null);
  if (parts.length === 0) return "Sin rasgo dominante";
  const text = parts.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function fallbackLabel(id: string): { above: string; below: string } | null {
  const meta = indicator(id);
  if (!meta) return null;
  const label = meta.label.toLowerCase();
  return { above: `${label} alto`, below: `${label} bajo` };
}

/**
 * Los dos indicadores que más separan a un grupo del resto, por media
 * estandarizada de sus miembros.
 */
export function dominantTraits(
  memberZ: readonly (readonly number[])[],
  indicatorIds: readonly string[],
  count = 2,
): ClusterTrait[] {
  if (memberZ.length === 0) return [];
  return indicatorIds
    .map((id, j) => {
      const mean = memberZ.reduce((sum, row) => sum + row[j], 0) / memberZ.length;
      return { indicator: id, above: mean > 0, gap: Math.abs(mean) };
    })
    .filter((trait) => trait.gap > 0.2)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, count)
    .map(({ indicator: id, above }) => ({ indicator: id, above }));
}
