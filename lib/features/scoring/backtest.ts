import { direccion } from "@/lib/features/scoring/evolution";
import type { Alert, AlertTipo, ScoreRow } from "@/lib/features/scoring/types";
import { median, monthIndex, percentile } from "@/lib/features/scoring/windows";

type Kind = Extract<AlertTipo, "deterioro" | "recuperacion">;
export type TargetScore = "scoreSolo" | "scoreGrupo";
/** `index` es la posición dentro de la serie ordenada de su empresa, no en `rows`. */
export type Event = { company: string; month: string; index: number; kind: Kind };
type BacktestKind = {
  events: number;
  alerts: number;
  matched: number;
  recall: number | null;
  falseAlarmRate: number | null;
  leadMedian: number | null;
  leadP25: number | null;
};
export type StressDecile = {
  decile: number;
  n: number;
  scoreMin: number;
  scoreMax: number;
  stressRate: number;
};
export type BacktestReport = {
  targetScore: TargetScore;
  forwardMarginSpearman: number | null;
  forwardMarginPairs: number;
  forwardStressAuc: number | null;
  forwardStressAucCi95: readonly [number, number] | null;
  forwardStressPrauc: number | null;
  forwardStressPairs: number;
  stressDeciles: StressDecile[];
  stressDecilesMonotonic: boolean | null;
  censoredMonths: number;
  deterioro: BacktestKind;
  recuperacion: BacktestKind;
};

/** Ventana de meses (inclusive) sobre la que se miden eventos, alertas y pares. */
export type BacktestOptions = {
  months?: readonly [string, string];
  targetScore?: TargetScore;
};

/** Meses del final de cada serie que no pueden contar como falsa alarma (censura por la derecha). */
const CENSORED_MONTHS = 6;

function eventAt(rows: ScoreRow[], index: number, kind: Kind): boolean {
  const current = monthIndex(rows[index].month);
  if (current < 0) return false;
  const at = (offset: number) =>
    rows.find((row) => monthIndex(row.month) === current + offset) ?? null;
  const next = [at(0), at(1), at(2)];
  if (next.some((r) => r === null || r.deficitMes === null)) return false;
  if (kind === "deterioro")
    return (
      at(-1)?.deficitMes === false &&
      Array.from({ length: 6 }, (_, i) => at(-i - 1)).every(
        (r) => r !== null && r.deficitMes !== null,
      ) &&
      Array.from({ length: 6 }, (_, i) => at(-i - 1)).filter((r) => r?.deficitMes).length <= 1 &&
      next.every((r) => r?.deficitMes)
    );
  return (
    at(-1)?.deficitMes === true &&
    Array.from({ length: 3 }, (_, i) => at(-i - 1)).every(
      (r) => r !== null && r.deficitMes !== null,
    ) &&
    Array.from({ length: 3 }, (_, i) => at(-i - 1)).filter((r) => r?.deficitMes).length >= 2 &&
    next.every((r) => r?.deficitMes === false)
  );
}
/** Agrupa por empresa y ordena cada serie por mes; el orden es determinista para las mismas filas. */
function porEmpresa(rows: ScoreRow[]): Map<string, ScoreRow[]> {
  const companies = new Map<string, ScoreRow[]>();
  for (const r of rows) {
    const list = companies.get(r.company) ?? [];
    list.push(r);
    companies.set(r.company, list);
  }
  for (const list of companies.values())
    list.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  return companies;
}

/**
 * Eventos de deterioro y recuperación de §13 en toda la serie, sin filtro de ventana: son los
 * mismos que cuenta `backtest` antes de recortar por `options.months`.
 */
export function detectEvents(rows: ScoreRow[]): Event[] {
  const events: Event[] = [];
  for (const [company, list] of porEmpresa(rows))
    for (let i = 0; i < list.length; i++)
      for (const kind of ["deterioro", "recuperacion"] as const)
        if (eventAt(list, i, kind)) events.push({ company, month: list[i].month, index: i, kind });
  return events;
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

function aucLowerIsRisk(pairs: { score: number; stress: boolean }[]): number | null {
  const positive = pairs.filter((pair) => pair.stress);
  const negative = pairs.filter((pair) => !pair.stress);
  if (!positive.length || !negative.length) return null;
  const ordered = [...pairs].sort((a, b) => a.score - b.score);
  let rankSum = 0;
  let rank = 1;
  for (let i = 0; i < ordered.length;) {
    let j = i + 1;
    while (j < ordered.length && ordered[j].score === ordered[i].score) j++;
    const averageRank = (rank + rank + j - i - 1) / 2;
    rankSum += averageRank * ordered.slice(i, j).filter((pair) => pair.stress).length;
    rank += j - i;
    i = j;
  }
  const highScoreWins =
    (rankSum - (positive.length * (positive.length + 1)) / 2) / (positive.length * negative.length);
  return 1 - highScoreWins;
}

function bootstrapAucCi95(
  pairs: { score: number; stress: boolean }[],
): readonly [number, number] | null {
  if (pairs.length < 20 || !pairs.some((pair) => pair.stress) || pairs.every((pair) => pair.stress))
    return null;
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  const samples: number[] = [];
  for (let iteration = 0; iteration < 200; iteration++) {
    const sample = Array.from(
      { length: pairs.length },
      () => pairs[Math.floor(random() * pairs.length)],
    );
    const auc = aucLowerIsRisk(sample);
    if (auc !== null) samples.push(auc);
  }
  if (!samples.length) return null;
  samples.sort((a, b) => a - b);
  return [samples[Math.floor(samples.length * 0.025)], samples[Math.floor(samples.length * 0.975)]];
}

/** Average precision con las notas bajas ordenadas primero (menor score = mayor riesgo). */
function praucLowerIsRisk(pairs: { score: number; stress: boolean }[]): number | null {
  const positives = pairs.filter((pair) => pair.stress).length;
  if (!positives) return null;
  const ordered = [...pairs].sort((a, b) => a.score - b.score);
  let hits = 0;
  let area = 0;
  for (let i = 0; i < ordered.length; i++) {
    if (!ordered[i].stress) continue;
    hits++;
    area += hits / (i + 1);
  }
  return area / positives;
}

function stressDeciles(pairs: { score: number; stress: boolean }[]): StressDecile[] {
  const sorted = [...pairs].sort((a, b) => a.score - b.score);
  return Array.from({ length: 10 }, (_, i) => {
    const from = Math.floor((i * sorted.length) / 10);
    const to = Math.floor(((i + 1) * sorted.length) / 10);
    const slice = sorted.slice(from, to);
    return {
      decile: i + 1,
      n: slice.length,
      scoreMin: slice[0]?.score ?? 0,
      scoreMax: slice.at(-1)?.score ?? 0,
      stressRate: slice.length ? slice.filter((pair) => pair.stress).length / slice.length : 0,
    };
  }).filter((decile) => decile.n > 0);
}

function stressDecilesMonotonic(deciles: StressDecile[]): boolean | null {
  if (deciles.length < 2) return null;
  return deciles.every(
    (decile, index) => index === 0 || decile.stressRate <= deciles[index - 1].stressRate,
  );
}

function scoreAt(row: ScoreRow, targetScore: TargetScore): number {
  return row[targetScore];
}

/**
 * Construye las alertas comparables de deterioro/recuperación para el score elegido. Las alertas
 * autónomas ya persistidas siguen siendo la fuente de verdad cuando están disponibles; esto
 * conserva la semántica enriquecida del motor. Para scoreGrupo (que no tiene alertas persistidas)
 * y series sintéticas sin alertas, se derivan con la misma dirección y persistencia de dos meses.
 */
function alertsForTarget(rows: ScoreRow[], targetScore: TargetScore): Map<number, Alert[]> {
  const out = new Map<number, Alert[]>();
  const persisted = new Map<Kind, boolean>(
    (["deterioro", "recuperacion"] as const).map((kind) => [
      kind,
      targetScore === "scoreSolo" && rows.some((row) => row.alertas.some((a) => a.tipo === kind)),
    ]),
  );
  const directions = rows.map((row) => {
    const current = scoreAt(row, targetScore);
    const month = monthIndex(row.month);
    const three = rows.find((candidate) => monthIndex(candidate.month) === month - 3);
    const six = rows.find((candidate) => monthIndex(candidate.month) === month - 6);
    return direccion(
      current,
      three ? scoreAt(three, targetScore) : null,
      six ? scoreAt(six, targetScore) : null,
    );
  });
  for (const kind of ["deterioro", "recuperacion"] as const) {
    if (persisted.get(kind)) {
      rows.forEach((row, index) => {
        const alerts = row.alertas.filter((alert) => alert.tipo === kind);
        if (alerts.length) out.set(index, [...(out.get(index) ?? []), ...alerts]);
      });
      continue;
    }
    const wanted = kind === "deterioro" ? "deterioro" : "mejora";
    rows.forEach((row, index) => {
      if (directions[index] !== wanted) return;
      let run = 1;
      while (
        index - run >= 0 &&
        directions[index - run] === wanted &&
        monthIndex(rows[index - run + 1].month) - monthIndex(rows[index - run].month) === 1
      )
        run++;
      if (run >= 2) {
        const alert: Alert = { tipo: kind, desdeMes: rows[index - run + 1].month };
        out.set(index, [...(out.get(index) ?? []), alert]);
      }
    });
  }
  return out;
}

/**
 * Métricas de §13 sobre la ventana `options.months` (ambos meses inclusive). Reglas:
 *
 * - **Eventos**: cuentan si el mes del evento cae dentro de la ventana y existen los 3 meses de
 *   seguimiento que exige su definición.
 * - **`matched` y lead time**: valen las alertas del mismo tipo emitidas en los 6 meses previos al
 *   evento, caigan donde caigan; una alerta puede adelantarse a la ventana.
 * - **Falsas alarmas**: una alerta se *emite* el primer mes en que aparece, no cada mes que sigue
 *   activa. Es elegible si su mes `m` cumple `m + censoredMonths ≤ último mes de la serie` —su
 *   seguimiento es observable; contarla si no lo es sería censura por la derecha— y
 *   `m + censoredMonths ≥ primer mes de la ventana` —su seguimiento solapa con la ventana—. Es
 *   falsa si no hay evento de su tipo en `(m, m + censoredMonths]`; ese evento vale aunque caiga
 *   fuera de la ventana, porque la alerta sí acertó. `alerts` cuenta las alertas elegibles y
 *   `falseAlarmRate = falseAlarms / alerts`.
 * - **Pares de Spearman**: `t` dentro de la ventana y con fila en `t + 3`.
 *
 * Los meses se comparan por índice de CALENDAR, no por posición en la lista de la empresa.
 */
export function backtest(rows: ScoreRow[], options: BacktestOptions = {}): BacktestReport {
  const [desde, hasta] = options.months ?? [];
  const targetScore = options.targetScore ?? "scoreSolo";
  const enVentana = (month: string) => desde === undefined || (month >= desde && month <= hasta!);
  const iVentana = desde === undefined ? Number.NEGATIVE_INFINITY : monthIndex(desde);
  const companies = porEmpresa(rows);
  // Los eventos se detectan en toda la serie: la ventana filtra los que cuentan (abajo), pero un
  // evento fuera de ella sigue redimiendo a la alerta que lo anunció.
  const events = detectEvents(rows);
  const pairs: [number, number][] = [];
  const stressPairs: { score: number; stress: boolean }[] = [];
  for (const list of companies.values()) {
    for (let i = 0; i < list.length; i++) {
      if (!enVentana(list[i].month)) continue;
      const current = monthIndex(list[i].month);
      const three = list.find((candidate) => monthIndex(candidate.month) === current + 3);
      const one = list.find((candidate) => monthIndex(candidate.month) === current + 1);
      const two = list.find((candidate) => monthIndex(candidate.month) === current + 2);
      if (three?.margenMes !== null && three !== undefined)
        pairs.push([scoreAt(list[i], targetScore), three.margenMes]);
      if (
        one &&
        two &&
        three &&
        one.deficitMes !== null &&
        two.deficitMes !== null &&
        three.deficitMes !== null
      )
        stressPairs.push({
          score: scoreAt(list[i], targetScore),
          stress: one.deficitMes && two.deficitMes && three.deficitMes,
        });
    }
  }
  const empty = (): BacktestKind => ({
    events: 0,
    alerts: 0,
    matched: 0,
    recall: null,
    falseAlarmRate: null,
    leadMedian: null,
    leadP25: null,
  });
  const deciles = stressDeciles(stressPairs);
  const report: BacktestReport = {
    targetScore,
    forwardMarginSpearman: spearman(pairs),
    forwardMarginPairs: pairs.length,
    forwardStressAuc: aucLowerIsRisk(stressPairs),
    forwardStressAucCi95: bootstrapAucCi95(stressPairs),
    forwardStressPrauc: praucLowerIsRisk(stressPairs),
    forwardStressPairs: stressPairs.length,
    stressDeciles: deciles,
    stressDecilesMonotonic: stressDecilesMonotonic(deciles),
    censoredMonths: CENSORED_MONTHS,
    deterioro: empty(),
    recuperacion: empty(),
  };
  for (const kind of ["deterioro", "recuperacion"] as const) {
    const todos = events.filter((e) => e.kind === kind);
    const relevant = todos.filter((e) => enVentana(e.month));
    const leads: number[] = [];
    let matched = 0,
      falseAlarms = 0,
      alerts = 0;
    for (const e of relevant) {
      const list = companies.get(e.company)!;
      const alertsByIndex = alertsForTarget(list, targetScore);
      const candidates = list
        .slice(Math.max(0, e.index - 6), e.index)
        .flatMap((r, offset) =>
          (alertsByIndex.get(Math.max(0, e.index - 6) + offset) ?? []).map((a) => ({
            ...a,
            mes: r.month,
          })),
        )
        .filter((a) => a.tipo === kind && monthIndex(a.desdeMes) !== -1);
      if (!candidates.length) continue;
      matched++;
      const iEvento = monthIndex(e.month);
      if (iEvento === -1) continue;
      const first = candidates.sort((a, b) =>
        a.desdeMes < b.desdeMes ? -1 : a.desdeMes > b.desdeMes ? 1 : 0,
      )[0];
      leads.push(iEvento - monthIndex(first.desdeMes));
    }
    for (const [company, list] of companies) {
      const alertsByIndex = alertsForTarget(list, targetScore);
      const ultimo = monthIndex(list[list.length - 1].month);
      if (ultimo === -1) continue;
      const cuando = todos.filter((e) => e.company === company).map((e) => monthIndex(e.month));
      for (let i = 0; i < list.length; i++) {
        const ahora = alertsByIndex.get(i)?.some((a) => a.tipo === kind) ?? false;
        const antes = alertsByIndex.get(i - 1)?.some((a) => a.tipo === kind) ?? false;
        if (!ahora || antes) continue; // solo la emisión, no cada mes que sigue activa
        const m = monthIndex(list[i].month);
        if (m === -1) continue;
        if (m + CENSORED_MONTHS > ultimo) continue; // seguimiento no observable (censura)
        if (m + CENSORED_MONTHS < iVentana) continue; // seguimiento ajeno a la ventana
        alerts++;
        if (!cuando.some((e) => e > m && e <= m + CENSORED_MONTHS)) falseAlarms++;
      }
    }
    report[kind] = {
      events: relevant.length,
      alerts,
      matched,
      recall: relevant.length ? matched / relevant.length : null,
      falseAlarmRate: alerts ? falseAlarms / alerts : null,
      leadMedian: median(leads),
      leadP25: percentile(leads, 0.25),
    };
  }
  return report;
}
