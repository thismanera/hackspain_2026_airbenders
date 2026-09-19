import { createHash } from "node:crypto";
import { banda, ORDEN } from "@/lib/features/decision/limit";
import type { Banda } from "@/lib/features/decision/params";
import { forecastGroup } from "@/lib/features/forecast/engine";
import {
  type Clip,
  FORECAST_PARAMS as P,
  type ForecastParameters,
  hashForecastParams,
  HORIZONTES,
  type Horizonte,
  type ForecastTargetParameters,
  type PDet,
  type Residuos,
} from "@/lib/features/forecast/params";
import type { ForecastGroupInput, ForecastRow } from "@/lib/features/forecast/types";
import { detectEvents } from "@/lib/features/scoring/backtest";
import type { Sample } from "@/lib/features/scoring/fit";
import { PARAMS, VARIABLES } from "@/lib/features/scoring/params";
import type { Percentiles, ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR, monthIndex, percentile } from "@/lib/features/scoring/windows";

/** §2: p1/p99 congelados con la misma muestra fiable que el ajuste de scoring. */
export function fitClip(samples: Sample[]): Clip {
  const clip = {} as Clip;
  for (const id of VARIABLES) {
    const xs = samples
      .filter(
        (s) => s.id === id && s.raw !== null && Number.isFinite(s.raw) && s.conf >= PARAMS.confSana,
      )
      .map((s) => s.raw as number);
    clip[id] = {
      p1: percentile(xs, P.clipPercentiles.bajo),
      p99: percentile(xs, P.clipPercentiles.alto),
    };
  }
  return clip;
}

function tablaVacia(): Residuos {
  const porBanda = () =>
    Object.fromEntries(ORDEN.map((b) => [b, { p10: 0, p90: 0 }])) as Record<
      Banda,
      { p10: number; p90: number }
    >;
  return { 3: porBanda(), 6: porBanda() };
}

function pDetVacia(): PDet {
  return Object.fromEntries(
    ORDEN.map((b) => [b, Object.fromEntries(ORDEN.map((c) => [c, null]))]),
  ) as PDet;
}

export type FitInput = {
  samples: Sample[];
  grupos: ForecastGroupInput[];
  percentiles: Percentiles;
  versionScoring: string;
  cutoff: string;
};

type Target = "scoreSolo" | "scoreGrupo";
type Par = { row: ScoreRow; forecast: ForecastRow; real: ScoreRow; h: Horizonte };

function score(row: ScoreRow, target: Target): number {
  return row[target];
}
function prediction(forecast: ForecastRow, h: Horizonte, target: Target): number {
  return target === "scoreSolo"
    ? forecast.horizontes[h].scoreSoloPred
    : forecast.horizontes[h].scoreGrupoPred;
}
function predictedBand(forecast: ForecastRow, h: Horizonte, target: Target): Banda {
  return target === "scoreSolo"
    ? forecast.horizontes[h].bandaSoloPred
    : forecast.horizontes[h].bandaGrupoPred;
}

function targetParameters(
  pars: Par[],
  target: Target,
  events: Map<string, number[]>,
): ForecastTargetParameters {
  const residuos = tablaVacia();
  for (const h of HORIZONTES) {
    for (const band of ORDEN) {
      const errors = pars
        .filter((p) => p.h === h && banda(score(p.row, target)) === band)
        .map((p) => score(p.real, target) - prediction(p.forecast, h, target));
      residuos[h][band] = {
        p10: Math.min(0, percentile(errors, P.residuosPercentiles.bajo) ?? 0),
        p90: Math.max(0, percentile(errors, P.residuosPercentiles.alto) ?? 0),
      };
    }
  }
  const p3 = pars.filter((p) => p.h === P.horizonteDecision);
  const mae = p3.length
    ? p3.reduce(
        (sum, p) =>
          sum +
          Math.abs(score(p.real, target) - prediction(p.forecast, P.horizonteDecision, target)),
        0,
      ) / p3.length
    : null;
  const maeBaseline = p3.length
    ? p3.reduce((sum, p) => sum + Math.abs(score(p.real, target) - score(p.row, target)), 0) /
      p3.length
    : null;
  const accuracy = p3.length
    ? p3.filter(
        (p) =>
          banda(score(p.real, target)) === predictedBand(p.forecast, P.horizonteDecision, target),
      ).length / p3.length
    : null;
  const baselineAccuracy = p3.length
    ? p3.filter((p) => banda(score(p.real, target)) === banda(score(p.row, target))).length /
      p3.length
    : null;
  const cells = new Map<string, { n: number; hits: number }>();
  for (const pair of p3) {
    const currentBand = banda(score(pair.row, target));
    const predicted = predictedBand(pair.forecast, P.horizonteDecision, target);
    const key = `${currentBand}|${predicted}`;
    const cell = cells.get(key) ?? { n: 0, hits: 0 };
    cell.n++;
    const t = monthIndex(pair.forecast.month);
    if (
      (events.get(pair.forecast.company) ?? []).some(
        (event) => event > t && event <= t + P.ventanaEvento,
      )
    )
      cell.hits++;
    cells.set(key, cell);
    const rowKey = `${currentBand}|*`;
    const row = cells.get(rowKey) ?? { n: 0, hits: 0 };
    row.n++;
    if (
      (events.get(pair.forecast.company) ?? []).some(
        (event) => event > t && event <= t + P.ventanaEvento,
      )
    )
      row.hits++;
    cells.set(rowKey, row);
  }
  const pDet = pDetVacia();
  for (const currentBand of ORDEN) {
    for (const predictedBandName of ORDEN) {
      const cell = cells.get(`${currentBand}|${predictedBandName}`);
      const row = cells.get(`${currentBand}|*`);
      const chosen =
        cell && cell.n >= P.minObsCelda ? cell : row && row.n >= P.minObsCelda ? row : null;
      pDet[currentBand][predictedBandName] = chosen ? chosen.hits / chosen.n : null;
    }
  }
  return {
    residuos,
    pDet,
    conectado:
      mae !== null &&
      maeBaseline !== null &&
      accuracy !== null &&
      baselineAccuracy !== null &&
      mae < maeBaseline &&
      accuracy >= baselineAccuracy,
    ajuste: {
      filas3m: p3.length,
      mae3m: mae,
      mae3mBaseline: maeBaseline,
      aciertoBanda3m: accuracy,
      aciertoBandaBaseline3m: baselineAccuracy,
    },
  };
}

/** Ajusta el forecast sin usar septiembre de 2026 ni filas futuras al calcular clips o residuos. */
export function fitForecast(input: FitInput): ForecastParameters {
  const clip = fitClip(input.samples);
  const empty: ForecastTargetParameters = {
    residuos: tablaVacia(),
    pDet: pDetVacia(),
    conectado: false,
    ajuste: { filas3m: 0, mae3m: null, mae3mBaseline: null },
  };
  const base: ForecastParameters = {
    version: "fit",
    paramsHash: hashForecastParams(P),
    versionScoring: input.versionScoring,
    clip,
    solo: empty,
    grupo: empty,
    residuos: empty.residuos,
    pDet: empty.pDet,
    conectado: false,
    ajuste: empty.ajuste,
  };
  const cutoff = monthIndex(input.cutoff);
  const pairs: Par[] = [];
  const events = new Map<string, number[]>();
  for (const group of input.grupos) {
    const trainingRows = group.rows.filter((row) => monthIndex(row.month) <= cutoff);
    const byKey = new Map(group.rows.map((row) => [`${row.company}|${row.month}`, row]));
    for (const event of detectEvents(trainingRows).filter((item) => item.kind === "deterioro")) {
      const list = events.get(event.company) ?? [];
      list.push(monthIndex(event.month));
      events.set(event.company, list);
    }
    for (const forecast of forecastGroup(group, base, input.percentiles)) {
      const t = monthIndex(forecast.month);
      const current = byKey.get(`${forecast.company}|${forecast.month}`);
      if (!current) continue;
      for (const h of HORIZONTES) {
        if (t + h > cutoff) continue;
        const real = byKey.get(`${forecast.company}|${CALENDAR[t + h]}`);
        if (real) pairs.push({ row: current, forecast, real, h });
      }
    }
  }
  const solo = targetParameters(pairs, "scoreSolo", events);
  const grupo = targetParameters(pairs, "scoreGrupo", events);
  const core = {
    paramsHash: base.paramsHash,
    versionScoring: input.versionScoring,
    clip,
    solo,
    grupo,
    residuos: solo.residuos,
    pDet: solo.pDet,
    conectado: solo.conectado,
    ajuste: solo.ajuste,
  } satisfies Omit<ForecastParameters, "version">;
  return { ...core, version: createHash("sha256").update(JSON.stringify(core)).digest("hex") };
}
