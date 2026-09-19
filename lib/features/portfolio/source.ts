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

function blockedByOf(current: MonthScore): string | null {
  const failed = current.decision.gates.find((gate) => !gate.passed);
  return failed ? (GATE_SHORTHAND[failed.id] ?? failed.label.toLowerCase()) : null;
}

function changedOf(current: MonthScore): boolean {
  return (
    current.decision.action !== "mantener" &&
    !(current.decision.action === "cerrar" && current.decision.previousLimit === 0)
  );
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

function rowFor(companyId: string, month: string): PortfolioRow | null {
  const dataset = buildPortfolio().get(companyId);
  if (!dataset) return null;
  const index = dataset.months.findIndex((entry) => entry.month === month);
  if (index === -1) return null;

  const current = dataset.months[index];
  const spark = dataset.months
    .slice(Math.max(0, index - 11), index + 1)
    .map((entry) => entry.score);
  const trail = dataset.months
    .slice(Math.max(0, index - (TRAIL_MONTHS - 1)), index + 1)
    .flatMap((entry): TrailPoint[] =>
      entry.trend3m === null
        ? []
        : [{ month: entry.month, score: entry.score, trend3m: entry.trend3m }],
    );
  const hot =
    current.nature === "estructural" && current.trend3m !== null && current.trend3m !== 0
      ? driverOf(dataset.months, index, current.trend3m)
      : null;

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
  const hot = rankHot(all);
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
    hot,
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

const CROSS_DEFAULT_SHARE = 0.3;

function memberAt(
  entry: { meta: { id: string }; months: MonthScore[] },
  index: number,
): GroupMember {
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

function weightedScore(members: { score: number; share: number }[]): number {
  const total = members.reduce((sum, member) => sum + member.share, 0);
  if (total === 0) return 0;
  return (
    Math.round(
      (members.reduce((sum, member) => sum + member.score * member.share, 0) / total) * 100,
    ) / 100
  );
}

/**
 * El grupo no es prestatario: es el techo y el contexto de sus empresas. Aquí
 * se consolida lo que ya está calculado por empresa; no se inventa un score
 * nuevo, se pondera por D1 el que cada una tiene.
 */
export function getGroupFile(groupId: string, requestedMonth?: string): GroupFileResponse | null {
  const entries = [...buildPortfolio().values()].filter((entry) => entry.meta.groupId === groupId);
  if (entries.length === 0) return null;

  const month = requestedMonth && CALENDAR.includes(requestedMonth) ? requestedMonth : LATEST_MONTH;
  const index = CALENDAR.indexOf(month);
  if (index === -1) return null;

  const members = entries
    .map((entry) => memberAt(entry, index))
    .sort((a, b) => b.share - a.share || a.id.localeCompare(b.id));

  const byEstado: Record<Estado, number> = { sana: 0, vigilar: 0, riesgo: 0, sin_datos: 0 };
  for (const member of members) byEstado[member.estado] += 1;

  const history = CALENDAR.slice(0, index + 1).map((past, t) => {
    const snapshot = entries.map((entry) => memberAt(entry, t));
    return {
      month: past,
      score: weightedScore(snapshot),
      exposure: snapshot.reduce((sum, member) => sum + member.limit, 0),
    };
  });
  const current = history[history.length - 1];
  const previous = history.length > 1 ? history[history.length - 2] : null;

  const totalShare = members.reduce((sum, member) => sum + member.share, 0) || 1;

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
    interdependence:
      Math.round(
        (members.reduce((sum, member) => sum + member.interdependence * member.share, 0) /
          totalShare) *
          10000,
      ) / 10000,
    crossDefault: members
      .filter(
        (member) =>
          member.action === "cerrar" && member.changed && member.share >= CROSS_DEFAULT_SHARE,
      )
      .map((member) => member.id),
    history,
  };
}

/* ------------------------------------------------------------------ *
 * Lista de grupos
 * ------------------------------------------------------------------ */

function monthIndexOf(requestedMonth?: string): { month: string; index: number } {
  const month = requestedMonth && CALENDAR.includes(requestedMonth) ? requestedMonth : LATEST_MONTH;
  return { month, index: CALENDAR.indexOf(month) };
}

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
export function getGroups(requestedMonth?: string): GroupsResponse {
  const { month, index } = monthIndexOf(requestedMonth);
  const byGroup = new Map<string, { meta: { id: string }; months: MonthScore[] }[]>();
  for (const entry of buildPortfolio().values()) {
    const list = byGroup.get(entry.meta.groupId) ?? [];
    list.push(entry);
    byGroup.set(entry.meta.groupId, list);
  }

  const groups: GroupRow[] = [...byGroup.entries()].map(([groupId, entries]) => {
    const members = entries.map((entry) => memberAt(entry, index));
    const previous = index > 0 ? entries.map((entry) => memberAt(entry, index - 1)) : null;
    const byEstado: Record<Estado, number> = { sana: 0, vigilar: 0, riesgo: 0, sin_datos: 0 };
    for (const member of members) byEstado[member.estado] += 1;
    const totalShare = members.reduce((sum, member) => sum + member.share, 0) || 1;
    const score = weightedScore(members);
    return {
      groupId,
      members: members.length,
      score,
      previousScore: previous ? weightedScore(previous) : null,
      estado: groupEstado(byEstado, score, members.length),
      byEstado,
      exposure: members.reduce((sum, member) => sum + member.limit, 0),
      previousExposure: members.reduce((sum, member) => sum + member.previousLimit, 0),
      eligible: members.filter((member) => member.eligible).length,
      interdependence:
        Math.round(
          (members.reduce((sum, member) => sum + member.interdependence * member.share, 0) /
            totalShare) *
            10000,
        ) / 10000,
      crossDefault: members
        .filter(
          (member) =>
            member.action === "cerrar" && member.changed && member.share >= CROSS_DEFAULT_SHARE,
        )
        .map((member) => member.id),
      moved: members.filter((member) => member.changed).length,
      alertCount: members.reduce((sum, member) => sum + member.alertCount, 0),
      topShare: Math.max(...members.map((member) => member.share)),
    };
  });

  groups.sort((a, b) => {
    const byCross = Number(b.crossDefault.length > 0) - Number(a.crossDefault.length > 0);
    if (byCross !== 0) return byCross;
    const byMoved = Number(b.moved > 0) - Number(a.moved > 0);
    if (byMoved !== 0) return byMoved;
    if (a.score !== b.score) return a.score - b.score;
    return a.groupId.localeCompare(b.groupId);
  });

  return { month, months: CALENDAR, groups, totalCompanies: buildPortfolio().size };
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

/**
 * Las alertas del mes. Deterioro: las que emite el motor. Mejora: la empresa
 * sube de banda o el motor amplía o abre línea; la señal que agradece la
 * empresa y que ningún banco enseña.
 */
export function getAlerts(requestedMonth?: string): AlertsResponse {
  const { month, index } = monthIndexOf(requestedMonth);
  const items: AlertItem[] = [];

  for (const entry of buildPortfolio().values()) {
    const current = entry.months[index];
    const previous = index > 0 ? entry.months[index - 1] : null;
    if (!current) continue;
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

/* ------------------------------------------------------------------ *
 * Backtest de anticipación
 * ------------------------------------------------------------------ */

const FOLLOW_WINDOW = 6;

/**
 * Se mide lo que se vende: si el motor avisó antes de cerrar. Un cierre cuenta
 * si la línea estaba viva el mes anterior. La anticipación es la distancia
 * entre el cierre y el inicio de la alerta más antigua que seguía viva al
 * cerrar. Nada aquí toca el score.
 */
export function getBacktest(requestedMonth?: string): BacktestResponse {
  const { month, index } = monthIndexOf(requestedMonth);
  const leadCounts = new Map<number, number>();
  const timeline = CALENDAR.slice(0, index + 1).map((past) => ({
    month: past,
    closes: 0,
    anticipated: 0,
    alerts: 0,
  }));
  let closes = 0;
  let anticipated = 0;
  let criticalAlerts = 0;
  let criticalFollowed = 0;
  let bandChanges = 0;
  let observedYears = 0;
  let flipFlops = 0;
  const leads: number[] = [];

  for (const entry of buildPortfolio().values()) {
    const months = entry.months.slice(0, index + 1);
    let flipped = false;

    for (let t = 0; t < months.length; t++) {
      const current = months[t];
      const previous = t > 0 ? months[t - 1] : null;

      if (current.alerts.length > 0) timeline[t].alerts += 1;

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
        timeline[t].closes += 1;
        const live = [...previous.alerts, ...current.alerts];
        const onsets = live
          .map((alert) => CALENDAR.indexOf(alert.onsetMonth))
          .filter((onset) => onset !== -1 && onset < t);
        if (onsets.length > 0) {
          anticipated += 1;
          timeline[t].anticipated += 1;
          const lead = t - Math.min(...onsets);
          leads.push(lead);
          leadCounts.set(lead, (leadCounts.get(lead) ?? 0) + 1);
        }
      }

      const critical = current.alerts.some((alert) => alert.severity === "critica");
      if (critical && previous && previous.decision.limit > 0 && t + FOLLOW_WINDOW <= index) {
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
    companies: buildPortfolio().size,
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
export function getBenchmark(companyId: string, requestedMonth?: string): BenchmarkResponse | null {
  const dataset = buildPortfolio().get(companyId);
  if (!dataset) return null;
  const { month, index } = monthIndexOf(requestedMonth);
  const mine = dataset.months[index];
  if (!mine) return null;

  const cohort = [...buildPortfolio().values()]
    .map((entry) => entry.months[index])
    .filter((entry): entry is MonthScore => Boolean(entry) && entry.coverage.observedMonths >= 3);

  const rows: BenchmarkRow[] = INDICATORS.map((meta) => {
    const own = mine.contributions.find((entry) => entry.indicator === meta.id);
    const peers = cohort
      .map((entry) => entry.contributions.find((item) => item.indicator === meta.id))
      .filter((entry): entry is Contribution => entry !== undefined && entry.raw !== null);
    if (!own || own.raw === null || peers.length === 0) {
      return {
        indicator: meta.id,
        raw: own?.raw ?? null,
        subscore: own?.subscore ?? 0,
        percentile: null,
        medianRaw: null,
        gapToMedian: null,
      };
    }
    const worse = peers.filter((entry) => entry.subscore < own.subscore).length;
    const medianRaw = median(peers.map((entry) => entry.raw as number));
    return {
      indicator: meta.id,
      raw: own.raw,
      subscore: own.subscore,
      percentile: Math.round((worse / peers.length) * 100) / 100,
      medianRaw,
      gapToMedian: medianRaw === null ? null : Math.round((own.raw - medianRaw) * 10000) / 10000,
    };
  });

  const scoresBelow = cohort.filter((entry) => entry.score < mine.score).length;

  return {
    company: companyId,
    month,
    cohort: cohort.length,
    scorePercentile: cohort.length ? Math.round((scoresBelow / cohort.length) * 100) / 100 : 0,
    rows,
  };
}
