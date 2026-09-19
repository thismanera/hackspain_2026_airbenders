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
  type PDet,
  type Residuos,
} from "@/lib/features/forecast/params";
import type { ForecastGroupInput, ForecastRow } from "@/lib/features/forecast/types";
import { detectEvents } from "@/lib/features/scoring/backtest";
import type { Sample } from "@/lib/features/scoring/fit";
import { PARAMS, VARIABLES } from "@/lib/features/scoring/params";
import type { Percentiles, ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR, monthIndex, percentile } from "@/lib/features/scoring/windows";

/** §2 `clip_proyeccion`: p1/p99 por variable con la misma regla de fiabilidad que scoring §11. */
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
  /** Muestras de empresa-mes de los grupos de ajuste con mes ≤ cutoff (las mismas de scoring:fit). */
  samples: Sample[];
  /** Grupos de ajuste completos (todas sus filas y flujos). */
  grupos: ForecastGroupInput[];
  percentiles: Percentiles;
  versionScoring: string;
  /** Último mes de ajuste: solo cuentan pares con `t + h ≤ cutoff` (§4). */
  cutoff: string;
};

type Par = { row: ScoreRow; f: ForecastRow; real: ScoreRow; h: Horizonte };

/**
 * §4-5 y §9: congela p1/p99, corre la proyección sobre ajuste con tablas vacías, y de sus errores
 * saca `p10/p90[h][banda]`, `P_det[banda][banda_pred_3m]` y la puerta `conectado` (MAE_3 < baseline
 * ingenuo). Las tablas se calculan una vez y se congelan con la versión.
 */
export function fitForecast(input: FitInput): ForecastParameters {
  const clip = fitClip(input.samples);
  const base: ForecastParameters = {
    version: "fit",
    paramsHash: hashForecastParams(P),
    versionScoring: input.versionScoring,
    clip,
    residuos: tablaVacia(),
    pDet: pDetVacia(),
    conectado: true,
    ajuste: { filas3m: 0, mae3m: null, mae3mBaseline: null },
  };
  const iCutoff = monthIndex(input.cutoff);
  const pares: Par[] = [];
  const todas: ScoreRow[] = [];
  for (const g of input.grupos) {
    todas.push(...g.rows);
    const byKey = new Map(g.rows.map((r) => [`${r.company}|${r.month}`, r]));
    for (const f of forecastGroup(g, base, input.percentiles)) {
      const t = monthIndex(f.month);
      const row = byKey.get(`${f.company}|${f.month}`)!;
      for (const h of HORIZONTES) {
        if (t + h > iCutoff) continue;
        // Fuera del calendario `CALENDAR[t + h]` es undefined: `byKey` falla y el par se descarta.
        const real = byKey.get(`${f.company}|${CALENDAR[t + h]}`);
        if (real) pares.push({ row, f, real, h });
      }
    }
  }
  const residuos = tablaVacia();
  for (const h of HORIZONTES)
    for (const b of ORDEN) {
      const e = pares
        .filter((p) => p.h === h && banda(p.row.score) === b)
        .map((p) => p.real.score - p.f.horizontes[h].scorePred);
      residuos[h][b] = {
        p10: Math.min(0, percentile(e, P.residuosPercentiles.bajo) ?? 0),
        p90: Math.max(0, percentile(e, P.residuosPercentiles.alto) ?? 0),
      };
    }
  // P_det: evento de deterioro (scoring §13) en (t, t + ventanaEvento]; solo t con seguimiento observable.
  const eventos = new Map<string, number[]>();
  for (const e of detectEvents(todas).filter((e) => e.kind === "deterioro")) {
    const list = eventos.get(e.company) ?? [];
    list.push(monthIndex(e.month));
    eventos.set(e.company, list);
  }
  const conteo = new Map<string, { n: number; hits: number }>();
  const cuenta = (key: string, hit: boolean) => {
    const c = conteo.get(key) ?? { n: 0, hits: 0 };
    c.n++;
    if (hit) c.hits++;
    conteo.set(key, c);
  };
  for (const p of pares.filter((p) => p.h === 3)) {
    const t = monthIndex(p.f.month);
    if (t + P.ventanaEvento > iCutoff) continue;
    const hit = (eventos.get(p.f.company) ?? []).some((e) => e > t && e <= t + P.ventanaEvento);
    cuenta(`${banda(p.row.score)}|${p.f.horizontes[3].bandaPred}`, hit);
    cuenta(`${banda(p.row.score)}|*`, hit);
  }
  const pDet = pDetVacia();
  for (const b of ORDEN)
    for (const c of ORDEN) {
      const celda = conteo.get(`${b}|${c}`);
      const fila = conteo.get(`${b}|*`);
      const usada =
        celda && celda.n >= P.minObsCelda ? celda : fila && fila.n >= P.minObsCelda ? fila : null;
      pDet[b][c] = usada ? usada.hits / usada.n : null;
    }
  const p3 = pares.filter((p) => p.h === 3);
  const mae = (err: (p: Par) => number) =>
    p3.length ? p3.reduce((a, p) => a + Math.abs(err(p)), 0) / p3.length : null;
  const mae3m = mae((p) => p.real.score - p.f.horizontes[3].scorePred);
  const mae3mBaseline = mae((p) => p.real.score - p.row.score);
  const core = {
    paramsHash: base.paramsHash,
    versionScoring: input.versionScoring,
    clip,
    residuos,
    pDet,
    conectado: mae3m !== null && mae3mBaseline !== null && mae3m < mae3mBaseline,
    ajuste: { filas3m: p3.length, mae3m, mae3mBaseline },
  } satisfies Omit<ForecastParameters, "version">;
  return { ...core, version: createHash("sha256").update(JSON.stringify(core)).digest("hex") };
}
