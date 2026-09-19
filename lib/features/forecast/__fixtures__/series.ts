import type { DecisionRow } from "@/lib/features/decision/types";
import type { ForecastParameters } from "@/lib/features/forecast/params";
import type { MonthlyFlow } from "@/lib/features/forecast/types";
import { FIXTURE_PERCENTILES } from "@/lib/features/scoring/__fixtures__/percentiles";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";
import { aggregate } from "@/lib/features/scoring/aggregate";
import { avalGrupo } from "@/lib/features/scoring/group";
import { VARIABLES, type VariableId } from "@/lib/features/scoring/params";
import type { Contribution, ScoreRow, VariableSet } from "@/lib/features/scoring/types";
import { CALENDAR, clamp } from "@/lib/features/scoring/windows";

/** Valores "sanos" constantes (scoring §12 `sana`); las series sobrescriben solo lo que miden. */
export const SANA = {
  A1: 0.15, A2: 0, A3: 3, A4: 0.05, A5: null,
  B1: 1, B2: 0, B3: 5,
  C1: 0.3, C2: 0.3, C3: 5, C4: 0, C5: 0.2, C6: 0,
} satisfies Record<VariableId, number | null>;
/** A5 sin línea lleva conf 0,3 (scoring §5); el resto conf 1. */
const CONF: Record<VariableId, number> = Object.fromEntries(
  VARIABLES.map((id) => [id, id === "A5" ? 0.3 : 1]),
) as Record<VariableId, number>;

export type Serie = Partial<Record<VariableId, (number | null)[]>>;
export type Grupo = { D1: number; D2: number | null; D3: number | null; D5: number; confD: number };
/** Lo que devuelve `rowsFromSeries`: filas de score y sus flujos mensuales alineados. */
export type SeriesFixture = { rows: ScoreRow[]; flows: (MonthlyFlow | undefined)[] };
export type SeriesOptions = {
  flows?: (MonthlyFlow | undefined)[];
  /** Variables de grupo por índice de mes; por defecto sin hermanas (D2 null ⇒ aval 0). */
  grupo?: (m: number) => Grupo;
  rachaB2?: number[];
  rachaDeficit?: number[];
  conf?: Partial<Record<VariableId, number>>;
};

export function flowsConst(n: number, cobrosOp: number, pagosOp: number): MonthlyFlow[] {
  return Array.from({ length: n }, () => ({ observed: true, cobrosOp, pagosOp }));
}

/** Flujos con cobros lineales `desde → hasta` y pagos fijos. */
export function flowsLineal(n: number, desde: number, hasta: number, pagosOp: number): MonthlyFlow[] {
  return Array.from({ length: n }, (_, i) => ({
    observed: true,
    cobrosOp: desde + ((hasta - desde) * i) / Math.max(1, n - 1),
    pagosOp,
  }));
}

/**
 * Una fila `ScoreRow` por mes (desde `CALENDAR[0]`), con `variables`, `scoreSolo`, `avalGrupo` y
 * `score` calculados con las funciones reales de scoring y los percentiles fijos de §12. La
 * longitud es la de la serie más larga (mínimo 1).
 */
export function rowsFromSeries(
  company: string,
  groupId: string,
  serie: Serie,
  opts: SeriesOptions = {},
): SeriesFixture {
  const n = Math.max(1, ...Object.values(serie).map((s) => s?.length ?? 0));
  const flows = opts.flows ?? flowsConst(n, 100_000, 85_000);
  const rows: ScoreRow[] = [];
  for (let m = 0; m < n; m++) {
    const vars = Object.fromEntries(
      VARIABLES.map((id) => {
        const raw = serie[id] ? (serie[id]![m] ?? null) : SANA[id];
        return [id, { raw, conf: raw === null && id !== "A5" ? 0 : (opts.conf?.[id] ?? CONF[id]) }];
      }),
    ) as VariableSet;
    const rachaB2 = opts.rachaB2?.[m] ?? (vars.B2.raw ?? 0);
    const rachaB2Prev = [1, 2, 3].map((k) => opts.rachaB2?.[m - k] ?? 0);
    const agg = aggregate(vars, { rachaB2Prev }, FIXTURE_PERCENTILES);
    const g = opts.grupo?.(m) ?? { D1: 1, D2: null, D3: null, D5: 0, confD: 0 };
    const aval = avalGrupo(agg.scoreSolo, g.D2, g.D3, g.D5);
    const score = clamp(agg.scoreSolo + aval, 0, 100);
    const variables: Contribution[] = [
      ...agg.contributions,
      { id: "grupo", raw: g.D2, subnota: g.D2 ?? 50, conf: g.confD, aportacion: score - agg.scoreSolo, umbralSano: null, sano: null },
    ];
    const f = flows[m];
    rows.push(
      scoreRowFixture({
        company, groupId, month: CALENDAR[m],
        score, scoreSolo: agg.scoreSolo, avalGrupo: aval, confianza: agg.confianza,
        subscores: agg.subscores, confs: agg.confs, variables,
        rachaB2, rachaDeficit: opts.rachaDeficit?.[m] ?? 0,
        D1: g.D1, D2: g.D2, D3: g.D3, D5: g.D5, confD: g.confD,
        deficitMes: f?.observed ? f.cobrosOp < f.pagosOp : null,
        margenMes: f?.observed && f.cobrosOp > 0 ? (f.cobrosOp - f.pagosOp) / f.cobrosOp : null,
      }),
    );
  }
  return { rows, flows };
}

const BANDAS = ["A", "B", "C", "D"] as const;
/** Parámetros neutros: sin clip, residuos ±0, P_det null, conectado. Los tests sobrescriben. */
export function paramsFixture(partial: Partial<ForecastParameters> = {}): ForecastParameters {
  return {
    version: "vf",
    paramsHash: "h",
    versionScoring: "v",
    clip: Object.fromEntries(VARIABLES.map((id) => [id, { p1: null, p99: null }])) as ForecastParameters["clip"],
    residuos: {
      3: Object.fromEntries(BANDAS.map((b) => [b, { p10: 0, p90: 0 }])) as ForecastParameters["residuos"][3],
      6: Object.fromEntries(BANDAS.map((b) => [b, { p10: 0, p90: 0 }])) as ForecastParameters["residuos"][6],
    },
    pDet: Object.fromEntries(
      BANDAS.map((b) => [b, Object.fromEntries(BANDAS.map((c) => [c, null]))]),
    ) as ForecastParameters["pDet"],
    conectado: true,
    ajuste: { filas3m: 0, mae3m: null, mae3mBaseline: null },
    ...partial,
  };
}

/** Fila de decisión mínima para tests de backtest. Solo tests. */
export function decisionFixture(partial: Partial<DecisionRow> = {}): DecisionRow {
  return {
    company: "c", month: CALENDAR[0], groupId: "g", motor: "v1", versionParametros: "v",
    elegible: true, motivo: null, puertasFallidas: [], banda: "A", bandaEfectiva: "A",
    capacidadCuotaAdv: 5_000, limiteCap: 60_000, limiteOp: 240_000, L: 60_000, LVigente: 60_000,
    TMax: 180, menu: [], plazoNaturalAnticipo: 60, accion: "mantener", motivoAccion: "",
    motivoGrupo: null, bandaPred3mUsada: null,
    estado: {
      LPrev: 60_000, accionPrev: "mantener", mesesElegibleSeguidos: 3, mesesReduccionSeguidos: 0,
      mesesPredPeorSeguidos: 0, cerradoDesde: null, crossDefaultActivo: false,
      causaCrossDefault: null, mesesConCrossDefault: 0,
    },
    ...partial,
  };
}
