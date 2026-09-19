/**
 * Consolidación pura del contrato del panel a partir de un `Dataset`: cartera,
 * fichas, grupos, alertas, backtest y benchmark. Aquí no se calcula ningún
 * score ni ninguna decisión; se ordena y agrega lo que el motor ya persistió.
 * Sin I/O: los tests lo ejercitan con el generador de `fixtures.ts`.
 */
import { CALENDAR, LATEST_MONTH } from "./calendar";
import type { CompanyDataset, Dataset } from "./dataset";
import { INDICATORS } from "./indicators";
import type {
  Accion,
  AlertDirection,
  AlertItem,
  AlertsResponse,
  BacktestResponse,
  Banda,
  BenchmarkResponse,
  BenchmarkRow,
  CompanyFileResponse,
  Contribution,
  Direccion,
  Estado,
  GroupFileResponse,
  GroupMember,
  GroupPeer,
  GroupRow,
  GroupsResponse,
  HotSignal,
  MonthScore,
  PortfolioResponse,
  PortfolioRow,
  PortfolioSummary,
  TrailPoint,
} from "./types";
import { isDecisionNews } from "./vocabulary";

export type PortfolioFilters = {
  month?: string;
  q?: string;
  estado?: Estado | "todos";
  accion?: Accion | "todas";
  direccion?: Direccion | "todas";
  banda?: Banda | "todas";
};

/** Lo mínimo que necesitan las funciones puras: las empresas y, si lo hay, el backtest del motor. */
export type SourceDataset = Pick<Dataset, "companies"> & Partial<Pick<Dataset, "engine">>;

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

export function resolveMonth(requestedMonth?: string): string {
  return requestedMonth && CALENDAR.includes(requestedMonth) ? requestedMonth : LATEST_MONTH;
}

/** Posición del mes dentro de la serie de la empresa; -1 si ese mes no existe para ella. */
function indexAt(entry: CompanyDataset, month: string): number {
  return entry.months.findIndex((point) => point.month === month);
}

function pointAt(entry: CompanyDataset, month: string): MonthScore | null {
  return entry.months.find((point) => point.month === month) ?? null;
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

function blockedByOf(current: MonthScore): string | null {
  const failed = current.decision.gates.find((gate) => !gate.passed);
  return failed ? (GATE_SHORTHAND[failed.id] ?? failed.label.toLowerCase()) : null;
}

function changedOf(current: MonthScore): boolean {
  return isDecisionNews(current.decision);
}

const TRAIL_MONTHS = 6;
const HOT_LIMIT = 8;

/**
 * La variable que más ha arrastrado el score en la misma ventana que `trend3m`.
 * Suma los deltas mensuales de cada indicador y se queda con el mayor en valor
 * absoluto, siempre que vaya en el sentido del movimiento: si el score cae, el
 * culpable es lo que más ha restado, no lo que más ha sumado.
 */
function driverOf(months: MonthScore[], index: number, trend3m: number): HotSignal | null {
  const window = months.slice(Math.max(0, index - 2), index + 1);
  const totals = new Map<string, number>();
  for (const entry of window) {
    for (const contribution of entry.contributions) {
      totals.set(
        contribution.indicator,
        (totals.get(contribution.indicator) ?? 0) + contribution.delta,
      );
    }
  }
  let best: { indicator: string; delta: number } | null = null;
  for (const [indicator, delta] of totals) {
    if (Math.sign(delta) !== Math.sign(trend3m)) continue;
    if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { indicator, delta };
  }
  const current = months[index]!;
  return {
    rank: 0,
    driver: best ? (INDICATORS.find((item) => item.id === best.indicator)?.label ?? null) : null,
    driverDelta: best ? Math.round(best.delta * 10) / 10 : 0,
    hasCritical: current.alerts.some((alert) => alert.severity === "critica"),
  };
}

function rowFor(entry: CompanyDataset, month: string): PortfolioRow | null {
  const index = indexAt(entry, month);
  if (index === -1) return null;

  const current = entry.months[index];
  const spark = entry.months.slice(Math.max(0, index - 11), index + 1).map((point) => point.score);
  const trail = entry.months
    .slice(Math.max(0, index - (TRAIL_MONTHS - 1)), index + 1)
    .flatMap((point): TrailPoint[] =>
      point.trend3m === null
        ? []
        : [{ month: point.month, score: point.score, trend3m: point.trend3m }],
    );
  const hot =
    current.nature === "estructural" && current.trend3m !== null && current.trend3m !== 0
      ? driverOf(entry.months, index, current.trend3m)
      : null;

  return {
    company: entry.meta,
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
    changed: changedOf(current),
    eligible: current.decision.eligible,
    blockedBy: blockedByOf(current),
    reason: current.decision.reason,
    alertCount: current.alerts.length,
    spark,
    trail,
    hot,
    share: current.group?.share ?? 1,
  };
}

/**
 * Las que más se han movido de verdad: cambio estructural, ordenado por cuánto
 * se ha movido el score en 3 meses. A igual movimiento, antes la que tiene una
 * alerta crítica, y después la que ha cambiado de acción este mes. Se calcula
 * sobre toda la cartera y se anota el rango en la fila, para que la tabla y el
 * mapa lo señalen aunque estén filtrados.
 */
function rankHot(rows: PortfolioRow[]): PortfolioRow[] {
  const candidates = rows.filter(
    (row): row is PortfolioRow & { hot: HotSignal; trend3m: number } =>
      row.hot !== null && row.trend3m !== null,
  );
  candidates.sort((a, b) => {
    const byMove = Math.abs(b.trend3m) - Math.abs(a.trend3m);
    if (byMove !== 0) return byMove;
    if (a.hot.hasCritical !== b.hot.hasCritical) return a.hot.hasCritical ? -1 : 1;
    if (a.changed !== b.changed) return a.changed ? -1 : 1;
    return a.company.id.localeCompare(b.company.id);
  });
  const top = candidates.slice(0, HOT_LIMIT);
  const ranked = new Set(top.map((row) => row.company.id));
  for (const row of rows) {
    if (!ranked.has(row.company.id)) row.hot = null;
  }
  top.forEach((row, index) => {
    row.hot.rank = index + 1;
  });
  return top;
}

/** Lo que necesitan filtro y resumen de una fila; la cartera materializada guarda solo esto por mes pasado. */
export type PortfolioLiteRow = Pick<
  PortfolioRow,
  "estado" | "action" | "direction" | "band" | "eligible" | "limit" | "changed"
> & { company: Pick<PortfolioRow["company"], "id" | "groupId"> };

export function liteRow(row: PortfolioRow): PortfolioLiteRow {
  return {
    company: { id: row.company.id, groupId: row.company.groupId },
    estado: row.estado,
    action: row.action,
    direction: row.direction,
    band: row.band,
    eligible: row.eligible,
    limit: row.limit,
    changed: row.changed,
  };
}

export function summarise(month: string, rows: PortfolioLiteRow[]): PortfolioSummary {
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

function rowsFor(companies: SourceDataset["companies"], month: string): PortfolioRow[] {
  const rows: PortfolioRow[] = [];
  for (const entry of companies.values()) {
    const row = rowFor(entry, month);
    if (row) rows.push(row);
  }
  return rows;
}

const ALL = () => true;

export function hasFilters(filters: PortfolioFilters): boolean {
  return matches(filters) !== ALL;
}

export function matches(filters: PortfolioFilters): (row: PortfolioLiteRow) => boolean {
  const inactive =
    !filters.q?.trim() &&
    (!filters.estado || filters.estado === "todos") &&
    (!filters.accion || filters.accion === "todas") &&
    (!filters.direccion || filters.direccion === "todas") &&
    (!filters.banda || filters.banda === "todas");
  if (inactive) return ALL;
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

export function portfolioFrom(
  dataset: SourceDataset,
  filters: PortfolioFilters = {},
): PortfolioResponse {
  const month = resolveMonth(filters.month);
  const keep = matches(filters);

  const all = rowsFor(dataset.companies, month);
  const hot = rankHot(all);
  const rows = all.filter(keep);

  // La historia arrastra el mismo filtro que la tabla: lo que se dibuja es lo que
  // se lista. Un gráfico de toda la cartera encima de una tabla filtrada por
  // "riesgo" contaría dos historias distintas.
  const history = CALENDAR.slice(0, CALENDAR.indexOf(month) + 1).map((past) =>
    past === month
      ? summarise(month, rows)
      : summarise(past, rowsFor(dataset.companies, past).filter(keep)),
  );
  const summary = history[history.length - 1];
  const previous = history.length > 1 ? history[history.length - 2] : null;

  rows.sort(compareRows);

  return {
    month,
    months: CALENDAR,
    summary,
    previous,
    history,
    rows,
    hot,
    totalUnfiltered: all.length,
  };
}

function compareRows(a: PortfolioRow, b: PortfolioRow): number {
  const byAction = priorityOf(a) - priorityOf(b);
  if (byAction !== 0) return byAction;
  const byDirection = DIRECTION_PRIORITY[a.direction] - DIRECTION_PRIORITY[b.direction];
  if (byDirection !== 0) return byDirection;
  if (a.score !== b.score) return a.score - b.score;
  return a.company.id.localeCompare(b.company.id);
}

/** Hermanas de grupo con dato ese mes, de mejor a peor score. */
export function groupPeersAt(
  companies: SourceDataset["companies"],
  entry: CompanyDataset,
  month: string,
): GroupPeer[] {
  const peers: GroupPeer[] = [];
  for (const other of companies.values()) {
    if (other.meta.groupId !== entry.meta.groupId || other.meta.id === entry.meta.id) continue;
    const peerMonth = pointAt(other, month);
    if (!peerMonth) continue;
    peers.push({
      id: other.meta.id,
      score: peerMonth.score,
      estado: peerMonth.estado,
      share: peerMonth.group?.share ?? 0,
    });
  }
  peers.sort((a, b) => b.score - a.score);
  return peers;
}

export function companyFileFrom(
  dataset: SourceDataset,
  companyId: string,
  requestedMonth?: string,
): CompanyFileResponse | null {
  const entry = dataset.companies.get(companyId);
  if (!entry) return null;

  const month = resolveMonth(requestedMonth);
  const index = indexAt(entry, month);
  if (index === -1) return null;

  return {
    company: entry.meta,
    month,
    months: CALENDAR,
    latest: entry.months[index],
    previous: index > 0 ? entry.months[index - 1] : null,
    history: entry.months.slice(0, index + 1),
    peers: groupPeersAt(dataset.companies, entry, month),
  };
}

const CROSS_DEFAULT_SHARE = 0.3;

function memberAt(entry: CompanyDataset, month: string): GroupMember | null {
  const index = indexAt(entry, month);
  if (index === -1) return null;
  const current = entry.months[index];
  const previous = index > 0 ? entry.months[index - 1] : null;
  return {
    id: entry.meta.id,
    score: current.score,
    previousScore: previous?.score ?? null,
    estado: current.estado,
    direction: current.direction,
    share: current.group?.share ?? 1,
    interdependence: current.group?.interdependence ?? 0,
    support: current.group?.support ?? 0,
    adjustment: current.group?.adjustment ?? 0,
    limit: current.decision.limit,
    previousLimit: current.decision.previousLimit,
    eligible: current.decision.eligible,
    action: current.decision.action,
    changed: changedOf(current),
    alertCount: current.alerts.length,
    blockedBy: blockedByOf(current),
  };
}

function membersAt(entries: CompanyDataset[], month: string): GroupMember[] {
  const members: GroupMember[] = [];
  for (const entry of entries) {
    const member = memberAt(entry, month);
    if (member) members.push(member);
  }
  return members;
}

function weightedScore(members: { score: number; share: number }[]): number {
  const total = members.reduce((sum, member) => sum + member.share, 0);
  if (total === 0) return 0;
  return (
    Math.round(
      (members.reduce((sum, member) => sum + member.score * member.share, 0) / total) * 100,
    ) / 100
  );
}

function interdependenceOf(members: GroupMember[]): number {
  const totalShare = members.reduce((sum, member) => sum + member.share, 0) || 1;
  return (
    Math.round(
      (members.reduce((sum, member) => sum + member.interdependence * member.share, 0) /
        totalShare) *
        10000,
    ) / 10000
  );
}

function crossDefaultOf(members: GroupMember[]): string[] {
  return members
    .filter(
      (member) =>
        member.action === "cerrar" && member.changed && member.share >= CROSS_DEFAULT_SHARE,
    )
    .map((member) => member.id);
}

function groupEntries(dataset: SourceDataset): Map<string, CompanyDataset[]> {
  const byGroup = new Map<string, CompanyDataset[]>();
  for (const entry of dataset.companies.values()) {
    const list = byGroup.get(entry.meta.groupId) ?? [];
    list.push(entry);
    byGroup.set(entry.meta.groupId, list);
  }
  return byGroup;
}

/**
 * El grupo no es prestatario: es el techo y el contexto de sus empresas. Aquí
 * se consolida lo que ya está calculado por empresa; no se inventa un score
 * nuevo, se pondera por D1 el que cada una tiene.
 */
export function groupFileFrom(
  dataset: SourceDataset,
  groupId: string,
  requestedMonth?: string,
): GroupFileResponse | null {
  const entries = groupEntries(dataset).get(groupId);
  if (!entries || entries.length === 0) return null;

  const month = resolveMonth(requestedMonth);
  const index = CALENDAR.indexOf(month);
  if (index === -1) return null;

  const members = membersAt(entries, month).sort(
    (a, b) => b.share - a.share || a.id.localeCompare(b.id),
  );
  if (members.length === 0) return null;

  const byEstado: Record<Estado, number> = { sana: 0, vigilar: 0, riesgo: 0, sin_datos: 0 };
  for (const member of members) byEstado[member.estado] += 1;

  const history = CALENDAR.slice(0, index + 1).flatMap((past) => {
    const snapshot = membersAt(entries, past);
    if (snapshot.length === 0) return [];
    return [
      {
        month: past,
        score: weightedScore(snapshot),
        exposure: snapshot.reduce((sum, member) => sum + member.limit, 0),
      },
    ];
  });
  const current = history[history.length - 1];
  const previous = history.length > 1 ? history[history.length - 2] : null;

  return {
    groupId,
    month,
    months: CALENDAR,
    members,
    score: current.score,
    previousScore: previous?.score ?? null,
    byEstado,
    exposure: current.exposure,
    previousExposure: members.reduce((sum, member) => sum + member.previousLimit, 0),
    eligible: members.filter((member) => member.eligible).length,
    interdependence: interdependenceOf(members),
    crossDefault: crossDefaultOf(members),
    history,
  };
}

/* ------------------------------------------------------------------ *
 * Lista de grupos
 * ------------------------------------------------------------------ */

function groupEstado(byEstado: Record<Estado, number>, score: number, members: number): Estado {
  if (byEstado.sin_datos === members) return "sin_datos";
  if (byEstado.riesgo > 0 && byEstado.riesgo * 2 >= members) return "riesgo";
  if (score < 45) return "riesgo";
  if (score < 60 || byEstado.riesgo > 0) return "vigilar";
  return "sana";
}

/**
 * Los grupos, ordenados por "quién me necesita": primero los que tienen una
 * empresa relevante cerrando, luego los que se mueven, luego por score.
 */
export function groupsFrom(dataset: SourceDataset, requestedMonth?: string): GroupsResponse {
  const month = resolveMonth(requestedMonth);
  const index = CALENDAR.indexOf(month);
  const previousMonth = index > 0 ? CALENDAR[index - 1] : null;

  const groups: GroupRow[] = [];
  for (const [groupId, entries] of groupEntries(dataset)) {
    const members = membersAt(entries, month);
    if (members.length === 0) continue;
    const previous = previousMonth ? membersAt(entries, previousMonth) : [];
    const byEstado: Record<Estado, number> = { sana: 0, vigilar: 0, riesgo: 0, sin_datos: 0 };
    for (const member of members) byEstado[member.estado] += 1;
    const score = weightedScore(members);
    groups.push({
      groupId,
      members: members.length,
      score,
      previousScore: previous.length > 0 ? weightedScore(previous) : null,
      estado: groupEstado(byEstado, score, members.length),
      byEstado,
      exposure: members.reduce((sum, member) => sum + member.limit, 0),
      previousExposure: members.reduce((sum, member) => sum + member.previousLimit, 0),
      eligible: members.filter((member) => member.eligible).length,
      interdependence: interdependenceOf(members),
      crossDefault: crossDefaultOf(members),
      moved: members.filter((member) => member.changed).length,
      alertCount: members.reduce((sum, member) => sum + member.alertCount, 0),
      topShare: Math.max(...members.map((member) => member.share)),
    });
  }

  groups.sort((a, b) => {
    const byCross = Number(b.crossDefault.length > 0) - Number(a.crossDefault.length > 0);
    if (byCross !== 0) return byCross;
    const byMoved = Number(b.moved > 0) - Number(a.moved > 0);
    if (byMoved !== 0) return byMoved;
    if (a.score !== b.score) return a.score - b.score;
    return a.groupId.localeCompare(b.groupId);
  });

  return { month, months: CALENDAR, groups, totalCompanies: dataset.companies.size };
}

/* ------------------------------------------------------------------ *
 * Alertas en las dos direcciones
 * ------------------------------------------------------------------ */

function monthsBetween(from: string, to: string): number {
  const a = CALENDAR.indexOf(from);
  const b = CALENDAR.indexOf(to);
  if (a === -1 || b === -1) return 0;
  return Math.max(0, b - a);
}

const SEVERITY_ORDER = { critica: 0, aviso: 1 } as const;
const BAND_RANK: Record<Banda, number> = { D: 0, C: 1, B: 2, A: 3 };

function formatK(value: number): string {
  return value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1).replace(".", ",")} M€`
    : `${Math.round(value / 1000)} k€`;
}

/** Desde cuándo viene subiendo el score, para fechar la mejora como se fecha el deterioro. */
function onsetOfImprovement(months: MonthScore[], index: number): string {
  let onset = index;
  while (onset > 0 && months[onset - 1].score < months[onset].score) onset -= 1;
  return months[onset].month;
}

/**
 * Las alertas del mes. Deterioro: las que emite el motor. Mejora: la empresa
 * sube de banda o el motor amplía o abre línea; la señal que agradece la
 * empresa y que ningún banco enseña.
 */
export function alertsFrom(dataset: SourceDataset, requestedMonth?: string): AlertsResponse {
  const month = resolveMonth(requestedMonth);
  const items: AlertItem[] = [];

  for (const entry of dataset.companies.values()) {
    const index = indexAt(entry, month);
    if (index === -1) continue;
    const current = entry.months[index];
    const previous = index > 0 ? entry.months[index - 1] : null;
    const base = {
      company: entry.meta.id,
      groupId: entry.meta.groupId,
      score: current.score,
      estado: current.estado,
      action: current.decision.action,
      limit: current.decision.limit,
      previousLimit: current.decision.previousLimit,
    };

    for (const alert of current.alerts) {
      items.push({
        ...base,
        id: `${entry.meta.id}:${alert.type}:${month}`,
        direction: "deterioro",
        type: alert.type,
        label: alert.label,
        indicator: alert.indicator,
        onsetMonth: alert.onsetMonth,
        confirmedMonth: alert.confirmedMonth,
        leadMonths: monthsBetween(alert.onsetMonth, alert.confirmedMonth),
        severity: alert.severity,
      });
    }

    const bandUp =
      previous !== null &&
      BAND_RANK[current.decision.band] > BAND_RANK[previous.decision.band] &&
      current.decision.eligible;
    const expands =
      changedOf(current) &&
      (current.decision.action === "ampliar" || current.decision.action === "abrir");
    if (bandUp || expands) {
      const onset = onsetOfImprovement(entry.months, index);
      items.push({
        ...base,
        id: `${entry.meta.id}:mejora:${month}`,
        direction: "mejora",
        type: bandUp ? "sube_banda" : current.decision.action,
        label: bandUp
          ? `Sube a banda ${current.decision.band}: puede pedir más o pagar menos`
          : current.decision.action === "abrir"
            ? `Pasa todas las puertas: primera línea de ${formatK(current.decision.limit)}`
            : `El motor amplía de ${formatK(current.decision.previousLimit)} a ${formatK(current.decision.limit)}`,
        indicator: bandUp ? "score" : null,
        onsetMonth: onset,
        confirmedMonth: month,
        leadMonths: monthsBetween(onset, month),
        severity: "aviso",
      });
    }
  }

  items.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    if (a.score !== b.score) return a.score - b.score;
    return a.company.localeCompare(b.company);
  });

  const byDirection: Record<AlertDirection, number> = { deterioro: 0, mejora: 0 };
  const bySeverity = { aviso: 0, critica: 0 };
  for (const item of items) {
    byDirection[item.direction] += 1;
    bySeverity[item.severity] += 1;
  }

  return { month, months: CALENDAR, items, byDirection, bySeverity };
}

/* ------------------------------------------------------------------ *
 * Backtest de anticipación
 * ------------------------------------------------------------------ */

const FOLLOW_WINDOW = 6;

/**
 * Se mide lo que se vende: si el motor avisó antes de cerrar. Un cierre cuenta
 * si la línea estaba viva el mes anterior. La anticipación es la distancia
 * entre el cierre y el inicio de la alerta más antigua que seguía viva al
 * cerrar. Nada aquí toca el score. Las métricas del propio motor (§13/§14)
 * viajan aparte en `engine`, tal y como las persistió el run.
 */
export function backtestFrom(dataset: SourceDataset, requestedMonth?: string): BacktestResponse {
  const month = resolveMonth(requestedMonth);
  const index = CALENDAR.indexOf(month);
  const leadCounts = new Map<number, number>();
  const timeline = CALENDAR.slice(0, index + 1).map((past) => ({
    month: past,
    closes: 0,
    anticipated: 0,
    alerts: 0,
  }));
  const timelineAt = new Map(timeline.map((point, position) => [point.month, position]));
  let closes = 0;
  let anticipated = 0;
  let criticalAlerts = 0;
  let criticalFollowed = 0;
  let bandChanges = 0;
  let observedYears = 0;
  let flipFlops = 0;
  const leads: number[] = [];

  for (const entry of dataset.companies.values()) {
    const months = entry.months.filter((point) => CALENDAR.indexOf(point.month) <= index);
    if (months.length === 0) continue;
    let flipped = false;

    for (let t = 0; t < months.length; t++) {
      const current = months[t];
      const previous = t > 0 ? months[t - 1] : null;
      const slot = timeline[timelineAt.get(current.month)!];
      const calendarIndex = CALENDAR.indexOf(current.month);

      if (current.alerts.length > 0) slot.alerts += 1;

      if (previous && current.decision.band !== previous.decision.band) bandChanges += 1;

      if (
        t >= 2 &&
        months[t - 2].decision.action !== months[t - 1].decision.action &&
        months[t - 2].decision.action === current.decision.action &&
        months[t - 1].decision.action !== "mantener"
      ) {
        flipped = true;
      }

      if (current.decision.action === "cerrar" && previous && previous.decision.limit > 0) {
        closes += 1;
        slot.closes += 1;
        const live = [...previous.alerts, ...current.alerts];
        const onsets = live
          .map((alert) => CALENDAR.indexOf(alert.onsetMonth))
          .filter((onset) => onset !== -1 && onset < calendarIndex);
        if (onsets.length > 0) {
          anticipated += 1;
          slot.anticipated += 1;
          const lead = calendarIndex - Math.min(...onsets);
          leads.push(lead);
          leadCounts.set(lead, (leadCounts.get(lead) ?? 0) + 1);
        }
      }

      const critical = current.alerts.some((alert) => alert.severity === "critica");
      if (
        critical &&
        previous &&
        previous.decision.limit > 0 &&
        calendarIndex + FOLLOW_WINDOW <= index
      ) {
        criticalAlerts += 1;
        const followed = months
          .slice(t, t + 1 + FOLLOW_WINDOW)
          .some(
            (later) => later.decision.action === "reducir" || later.decision.action === "cerrar",
          );
        if (followed) criticalFollowed += 1;
      }
    }

    if (flipped) flipFlops += 1;
    observedYears += Math.max(1, months.length - 1) / 12;
  }

  leads.sort((a, b) => a - b);
  const medianLead =
    leads.length === 0
      ? null
      : leads.length % 2 === 1
        ? leads[(leads.length - 1) / 2]
        : (leads[leads.length / 2 - 1] + leads[leads.length / 2]) / 2;

  return {
    cutoff: month,
    months: CALENDAR,
    companies: dataset.companies.size,
    closes,
    anticipated,
    leadTimes: [...leadCounts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([lead, count]) => ({ months: lead, count })),
    medianLead,
    criticalAlerts,
    criticalFollowed,
    bandChangesPerYear:
      observedYears > 0 ? Math.round((bandChanges / observedYears) * 100) / 100 : 0,
    flipFlops,
    timeline,
    engine: dataset.engine ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Benchmark frente a pares
 * ------------------------------------------------------------------ */

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Lo único que un tesorero no sabe de su empresa: dónde queda frente al resto.
 * Percentil sobre la escala 0-100 ya calculada, así "mejor" significa lo mismo
 * en variables "mejor alto" y "mejor bajo".
 */
export function benchmarkFrom(
  dataset: SourceDataset,
  companyId: string,
  requestedMonth?: string,
): BenchmarkResponse | null {
  const entry = dataset.companies.get(companyId);
  if (!entry) return null;
  const month = resolveMonth(requestedMonth);
  const mine = pointAt(entry, month);
  if (!mine) return null;
  return benchmarkAgainst(mine, cohortAt(dataset.companies, month));
}

/**
 * La cohorte de un mes reducida a lo que el benchmark necesita: scores y subnotas
 * ordenados (percentil por búsqueda binaria) y mediana del dato bruto por indicador.
 */
export type CohortStats = {
  month: string;
  size: number;
  scores: number[];
  indicators: Record<string, { subscores: number[]; medianRaw: number | null }>;
};

export function cohortAt(companies: SourceDataset["companies"], month: string): CohortStats {
  const cohort: MonthScore[] = [];
  for (const other of companies.values()) {
    const point = pointAt(other, month);
    if (point && point.coverage.observedMonths >= 3) cohort.push(point);
  }
  const indicators: CohortStats["indicators"] = {};
  for (const meta of INDICATORS) {
    const peers = cohort
      .map((point) => point.contributions.find((item) => item.indicator === meta.id))
      .filter((item): item is Contribution => item !== undefined && item.raw !== null);
    indicators[meta.id] = {
      subscores: peers.map((item) => item.subscore).sort((a, b) => a - b),
      medianRaw: median(peers.map((item) => item.raw as number)),
    };
  }
  return {
    month,
    size: cohort.length,
    scores: cohort.map((point) => point.score).sort((a, b) => a - b),
    indicators,
  };
}

/** Cuántos valores de una lista ordenada quedan por debajo de `value`. */
function countBelow(sorted: number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (sorted[mid] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function benchmarkAgainst(mine: MonthScore, cohort: CohortStats): BenchmarkResponse {
  const rows: BenchmarkRow[] = INDICATORS.map((meta) => {
    const own = mine.contributions.find((item) => item.indicator === meta.id);
    const peers = cohort.indicators[meta.id];
    if (!own || own.raw === null || !peers || peers.subscores.length === 0) {
      return {
        indicator: meta.id,
        raw: own?.raw ?? null,
        subscore: own?.subscore ?? 0,
        percentile: null,
        medianRaw: null,
        gapToMedian: null,
      };
    }
    const worse = countBelow(peers.subscores, own.subscore);
    const medianRaw = peers.medianRaw;
    return {
      indicator: meta.id,
      raw: own.raw,
      subscore: own.subscore,
      percentile: Math.round((worse / peers.subscores.length) * 100) / 100,
      medianRaw,
      gapToMedian: medianRaw === null ? null : Math.round((own.raw - medianRaw) * 10000) / 10000,
    };
  });

  const scoresBelow = countBelow(cohort.scores, mine.score);

  return {
    company: mine.company,
    month: cohort.month,
    cohort: cohort.size,
    scorePercentile: cohort.size ? Math.round((scoresBelow / cohort.size) * 100) / 100 : 0,
    rows,
  };
}
