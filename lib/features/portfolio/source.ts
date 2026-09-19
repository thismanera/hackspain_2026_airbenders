/**
 * Único punto de contacto entre el panel y de dónde salen los datos.
 *
 * Hoy lee de `fixtures.ts`. Cuando el motor de scoring esté corriendo contra la
 * base de datos, se sustituyen las dos funciones de este fichero por consultas a
 * Prisma (`companyMonthScore` / `companyMonthDecision`) y no hay que tocar nada
 * más: ni las rutas de API, ni los hooks, ni una sola pantalla.
 */
import { CALENDAR, LATEST_MONTH } from "./calendar";
import { buildPortfolio } from "./fixtures";
import type {
  Accion,
  Banda,
  CompanyFileResponse,
  Direccion,
  Estado,
  GroupPeer,
  PortfolioResponse,
  PortfolioRow,
  PortfolioSummary,
} from "./types";
import { deriveEstado } from "./vocabulary";

export type PortfolioFilters = {
  month?: string;
  q?: string;
  estado?: Estado | "todos";
  accion?: Accion | "todas";
  direccion?: Direccion | "todas";
  banda?: Banda | "todas";
};

/**
 * Orden por "quién me necesita este mes": primero lo que se mueve, y dentro de
 * eso lo que peor está. Una empresa que lleva un año sin línea y sigue sin ella
 * no es noticia, así que cae al fondo aunque su acción sea `cerrar`.
 */
const ACTION_PRIORITY = {
  cerrar: 0,
  reducir: 1,
  abrir: 2,
  ampliar: 3,
  mantener: 4,
} satisfies Record<Accion, number>;

const UNCHANGED_PRIORITY = 5;

function priorityOf(row: PortfolioRow): number {
  if (!row.changed && row.action === "cerrar") return UNCHANGED_PRIORITY;
  return ACTION_PRIORITY[row.action];
}

const DIRECTION_PRIORITY: Record<Direccion, number> = {
  deterioro: 0,
  estable: 1,
  mejora: 2,
};

export function availableMonths(): string[] {
  return CALENDAR;
}

export function latestMonth(): string {
  return LATEST_MONTH;
}

/** Nombre corto de cada puerta, para caber debajo de la acción en la tabla. */
const GATE_SHORTHAND: Record<string, string> = {
  historia: "sin historia",
  estado: "score bajo",
  fiabilidad: "impago",
  caja: "la caja no cubre",
  clientes: "vencido alto",
  grupo: "grupo en cierre",
  plazo: "sin plazo posible",
};

function rowFor(companyId: string, month: string): PortfolioRow | null {
  const dataset = buildPortfolio().get(companyId);
  if (!dataset) return null;
  const index = dataset.months.findIndex((entry) => entry.month === month);
  if (index === -1) return null;

  const current = dataset.months[index];
  const spark = dataset.months
    .slice(Math.max(0, index - 11), index + 1)
    .map((entry) => entry.score);

  return {
    company: dataset.meta,
    month: current.month,
    score: current.score,
    confidence: current.confidence,
    estado: current.estado,
    trend3m: current.trend3m,
    direction: current.direction,
    nature: current.nature,
    band: current.decision.band,
    limit: current.decision.limit,
    previousLimit: current.decision.previousLimit,
    apr: current.decision.eligible ? current.decision.apr : null,
    action: current.decision.action,
    changed:
      current.decision.action !== "mantener" &&
      !(current.decision.action === "cerrar" && current.decision.previousLimit === 0),
    eligible: current.decision.eligible,
    blockedBy: (() => {
      const failed = current.decision.gates.find((gate) => !gate.passed);
      return failed ? (GATE_SHORTHAND[failed.id] ?? failed.label.toLowerCase()) : null;
    })(),
    reason: current.decision.reason,
    alertCount: current.alerts.length,
    spark,
  };
}

function summarise(month: string, rows: PortfolioRow[]): PortfolioSummary {
  const byEstado: Record<Estado, number> = { sana: 0, vigilar: 0, riesgo: 0, sin_datos: 0 };
  const byDireccion: Record<Direccion, number> = { mejora: 0, estable: 0, deterioro: 0 };
  const byAccion: Record<Accion, number> = {
    abrir: 0,
    ampliar: 0,
    mantener: 0,
    reducir: 0,
    cerrar: 0,
  };
  let eligible = 0;
  let exposure = 0;
  let moved = 0;

  for (const row of rows) {
    byEstado[row.estado] += 1;
    byDireccion[row.direction] += 1;
    if (row.eligible) {
      eligible += 1;
      exposure += row.limit;
    }
    if (row.changed) {
      moved += 1;
      byAccion[row.action] += 1;
    }
  }

  return { month, total: rows.length, byEstado, byDireccion, byAccion, eligible, exposure, moved };
}

function rowsFor(month: string): PortfolioRow[] {
  return [...buildPortfolio().keys()]
    .map((companyId) => rowFor(companyId, month))
    .filter((row): row is PortfolioRow => row !== null);
}

function matches(filters: PortfolioFilters): (row: PortfolioRow) => boolean {
  const needle = filters.q?.trim().toLowerCase() ?? "";
  return (row) => {
    if (needle && !`${row.company.id} ${row.company.groupId}`.toLowerCase().includes(needle)) {
      return false;
    }
    if (filters.estado && filters.estado !== "todos" && row.estado !== filters.estado) return false;
    if (filters.accion && filters.accion !== "todas" && row.action !== filters.accion) return false;
    if (filters.direccion && filters.direccion !== "todas" && row.direction !== filters.direccion) {
      return false;
    }
    if (filters.banda && filters.banda !== "todas" && row.band !== filters.banda) return false;
    return true;
  };
}

export function getPortfolio(filters: PortfolioFilters = {}): PortfolioResponse {
  const month = filters.month && CALENDAR.includes(filters.month) ? filters.month : LATEST_MONTH;
  const keep = matches(filters);

  const all = rowsFor(month);
  const rows = all.filter(keep);

  // La historia arrastra el mismo filtro que la tabla: lo que se dibuja es lo que
  // se lista. Un gráfico de toda la cartera encima de una tabla filtrada por
  // "riesgo" contaría dos historias distintas.
  const history = CALENDAR.slice(0, CALENDAR.indexOf(month) + 1).map((past) =>
    past === month ? summarise(month, rows) : summarise(past, rowsFor(past).filter(keep)),
  );
  const summary = history[history.length - 1];
  const previous = history.length > 1 ? history[history.length - 2] : null;

  rows.sort((a, b) => {
    const byAction = priorityOf(a) - priorityOf(b);
    if (byAction !== 0) return byAction;
    const byDirection = DIRECTION_PRIORITY[a.direction] - DIRECTION_PRIORITY[b.direction];
    if (byDirection !== 0) return byDirection;
    if (a.score !== b.score) return a.score - b.score;
    return a.company.id.localeCompare(b.company.id);
  });

  return {
    month,
    months: CALENDAR,
    summary,
    previous,
    history,
    rows,
    totalUnfiltered: all.length,
  };
}

export function getCompanyFile(
  companyId: string,
  requestedMonth?: string,
): CompanyFileResponse | null {
  const dataset = buildPortfolio().get(companyId);
  if (!dataset) return null;

  const month = requestedMonth && CALENDAR.includes(requestedMonth) ? requestedMonth : LATEST_MONTH;
  const index = dataset.months.findIndex((entry) => entry.month === month);
  if (index === -1) return null;

  const portfolio = buildPortfolio();
  const peers: GroupPeer[] = [...portfolio.values()]
    .filter((entry) => entry.meta.groupId === dataset.meta.groupId && entry.meta.id !== companyId)
    .map((entry) => {
      const peerMonth = entry.months[index];
      return {
        id: entry.meta.id,
        score: peerMonth.score,
        estado: deriveEstado(peerMonth.score, peerMonth.confidence, 0),
        share: peerMonth.group?.share ?? 0,
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    company: dataset.meta,
    month,
    months: CALENDAR,
    latest: dataset.months[index],
    previous: index > 0 ? dataset.months[index - 1] : null,
    history: dataset.months.slice(0, index + 1),
    peers,
  };
}
