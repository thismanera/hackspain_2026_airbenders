/**
 * Contrato en memoria de una ejecución del motor y su traducción al formato que
 * consume el panel (`MonthScore`). Sin I/O: la carga desde Postgres vive en
 * `load-dataset.ts`, para que este módulo (y `derive.ts`) se puedan probar sin
 * base de datos.
 */
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { decisionRowSchema } from "@/lib/features/decision/contracts";
import { forecastRowSchema } from "@/lib/features/forecast/contracts";
import type { ScoreRow } from "@/lib/features/scoring/types";

import { forecastImpact } from "./forecast-impact";
import type { CompanyMeta, Decision, EngineMetrics, Forecast, MonthScore } from "./types";
import { deriveBanda } from "./vocabulary";

export type CompanyDataset = {
  meta: CompanyMeta;
  /** Ordenados por mes ascendente; puede faltar algún mes si la empresa no existía. */
  months: MonthScore[];
};

export type Dataset = {
  runId: string;
  parameterVersion: string;
  completedAt: Date | null;
  engine: EngineMetrics | null;
  companies: Map<string, CompanyDataset>;
};

/** No hay ninguna ejecución compatible importada: la UI enseña "motor no disponible". */
export class ScoringUnavailableError extends Error {
  readonly code = "SCORING_UNAVAILABLE";
  constructor(message = "No hay ninguna ejecución de scoring compatible en la base de datos") {
    super(message);
    this.name = "ScoringUnavailableError";
  }
}

type DecisionRow = ReturnType<typeof decisionRowSchema.parse>;
type ForecastRow = ReturnType<typeof forecastRowSchema.parse>;

type GateId = "historia" | "estado" | "fiabilidad" | "caja" | "clientes" | "grupo";
const GATE_IDS: GateId[] = ["historia", "estado", "fiabilidad", "caja", "clientes", "grupo"];
const GATE_LABELS = {
  historia: "Historia suficiente",
  estado: "Estado autónomo",
  fiabilidad: "Obligaciones",
  caja: "Caja",
  clientes: "Morosidad comercial",
  grupo: "Riesgo del grupo",
} satisfies Record<GateId, string>;

const CRITICAL_ALERTS = new Set(["impago_obligaciones", "vencido_alto"]);

/** Traduce la fila persistida (score + decisión + forecast) al contrato del panel. */
export function monthScore(
  row: ScoreRow,
  decision: DecisionRow | null,
  forecast: ForecastRow | null,
): MonthScore {
  const failed = new Set<string>(decision?.puertasFallidas ?? []);
  const gates = GATE_IDS.map((id) => ({
    id,
    label: GATE_LABELS[id],
    passed: !failed.has(id),
    detail: failed.has(id) ? (decision?.motivo ?? "Puerta no superada") : "Superada",
  }));
  const menu =
    decision?.menu.map((option) => ({
      days: option.plazo,
      maxAmount: option.cantidadMax,
      apr: option.tae,
      cost: option.costeMax,
    })) ?? [];
  /* La ficha enseña el desglose de la TAE "desde", que es la del primer plazo
     del menú: el mismo tramo del que sale `apr`, para que la suma cuadre. */
  const split = decision?.menu[0]?.desglose;
  const deltas = new Map(row.deltaContrib.map((delta) => [delta.id, delta.delta]));
  const decisionOut: Decision = {
    eligible: decision?.elegible ?? false,
    reason: decision?.motivo ?? decision?.motivoAccion ?? "Sin decisión importada",
    gates,
    band: decision?.banda ?? deriveBanda(row.scoreSolo),
    limit: decision?.L ?? 0,
    previousLimit: decision?.estado.LPrev ?? 0,
    maxTenorDays: decision?.TMax ?? 0,
    baseApr: menu[0]?.apr ?? 0,
    apr: menu[0]?.apr ?? 0,
    aprBreakdown: {
      base: split?.base ?? 0,
      tenorPremium: split?.primaPlazo ?? 0,
      confidencePremium: split?.primaConfianza ?? 0,
      trendAdjustment: split?.ajusteTendencia ?? 0,
      forecastPremium: split?.primaPrevision ?? 0,
    },
    menu,
    action: decision?.accion ?? "mantener",
    adverseCapacity: row.capacidadCuotaAdv,
    capacityLimit: decision?.limiteOp ?? 0,
    operatingLimit: decision?.L ?? 0,
  };
  /* La previsión aplanada más su lectura en dinero (banda prevista → límite,
     TAE e intereses), calculada aquí para que ninguna pantalla haga cuentas. */
  const forecastOut: Forecast | null = forecast
    ? {
        scoreSoloPred3m: forecast.horizontes[3].scoreSoloPred,
        scoreGrupoPred3m: forecast.horizontes[3].scoreGrupoPred,
        scoreSoloPred6m: forecast.horizontes[6].scoreSoloPred,
        scoreGrupoPred6m: forecast.horizontes[6].scoreGrupoPred,
        p10Solo3m: forecast.horizontes[3].p10Solo,
        p90Solo3m: forecast.horizontes[3].p90Solo,
        p10Grupo3m: forecast.horizontes[3].p10Grupo,
        p90Grupo3m: forecast.horizontes[3].p90Grupo,
        p10Solo6m: forecast.horizontes[6].p10Solo,
        p90Solo6m: forecast.horizontes[6].p90Solo,
        bandaSoloPred3m: forecast.horizontes[3].bandaSoloPred,
        bandaSoloPred6m: forecast.horizontes[6].bandaSoloPred,
        direccionPred: forecast.direccionSoloPred,
        sinTendencia: forecast.sinTendencia.length > 0,
        metodoSolo: forecast.metodoSolo,
        metodoGrupo: forecast.metodoGrupo,
        impact: forecastImpact(decisionOut, forecast.horizontes[3].scoreSoloPred),
      }
    : null;
  return {
    company: row.company,
    month: row.month,
    score: row.scoreSolo,
    standaloneScore: row.scoreSolo,
    confidence: row.confianza,
    estado: row.estadoSolo,
    blocks: row.subscores,
    contributions: row.variables.map((variable) => ({
      indicator: variable.id,
      raw: variable.raw,
      subscore: variable.subnota ?? 50,
      confidence: variable.conf,
      weight: variable.pesoEfectivo,
      contribution: variable.aportacion,
      delta: deltas.get(variable.id) ?? 0,
    })),
    trend3m: row.tendScore3m,
    direction: row.direccion,
    nature: row.naturaleza,
    group:
      row.scoreGrupo === row.scoreSolo && row.ajusteHolding === 0
        ? null
        : {
            groupId: row.groupId,
            siblings: row.cobertura.nHermanasConDatos,
            weight: row.D5,
            peerScore: row.D2 ?? row.scoreSolo,
            support: row.D3 ?? 0,
            share: row.D1,
            interdependence: row.D5,
            adjustment: row.ajusteHolding,
          },
    decision: decisionOut,
    alerts: row.alertas.map((alert) => ({
      type: alert.tipo,
      label: alert.tipo.replaceAll("_", " "),
      indicator: alert.tipo,
      onsetMonth: alert.desdeMes,
      confirmedMonth: row.month,
      severity: CRITICAL_ALERTS.has(alert.tipo) ? "critica" : "aviso",
    })),
    coverage: {
      observedMonths: row.cobertura.mesesObs6m,
      classifiedShare: row.cobertura.pctClasificado6m,
      hasInvoices: row.cobertura.nFacturasCli6m + row.cobertura.nFacturasProv6m > 0,
      hasDebt: row.cobertura.tieneCuotas,
      hasCreditLine: row.cobertura.tieneLineaCredito,
    },
    scoreSolo: row.scoreSolo,
    scoreGrupo: row.scoreGrupo,
    forecast: forecastOut,
  };
}

/* ------------------------------------------------------------------ *
 * Métricas del backtest del motor (scripts/scoring.ts backtest → score_runs.metrics)
 * ------------------------------------------------------------------ */

const kindSchema = z.object({
  events: z.number(),
  alerts: z.number(),
  matched: z.number(),
  recall: z.number().nullable(),
  falseAlarmRate: z.number().nullable(),
  leadMedian: z.number().nullable(),
});

const reportSchema = z.object({
  forwardMarginSpearman: z.number().nullable(),
  forwardStressAuc: z.number().nullable(),
  forwardStressAucCi95: z.tuple([z.number(), z.number()]).nullable(),
  stressDecilesMonotonic: z.boolean().nullable(),
  deterioro: kindSchema,
  recuperacion: kindSchema,
});

const runMetricsSchema = z.object({
  scoreSolo: reportSchema,
  scoreGrupo: reportSchema,
  months: z.tuple([z.string(), z.string()]),
  validationCompanies: z.number(),
  decision: z.object({
    eventos: z.number(),
    exposicionEvitada: z.number(),
    ingresosSimulados: z.number(),
    oscilacion: z.number(),
    cierres: z.number(),
    cierresFalsos: z.number(),
    leadTimeCierreMediano: z.number().nullable(),
  }),
});

export function engineMetrics(raw: Prisma.JsonValue | null): EngineMetrics | null {
  const parsed = runMetricsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const m = parsed.data;
  const kind = (report: z.infer<typeof kindSchema>) => ({
    events: report.events,
    alerts: report.alerts,
    matched: report.matched,
    recall: report.recall,
    falseAlarmRate: report.falseAlarmRate,
    leadMedian: report.leadMedian,
  });
  return {
    window: m.months,
    validationCompanies: m.validationCompanies,
    scoreSolo: {
      spearman: m.scoreSolo.forwardMarginSpearman,
      stressAuc: m.scoreSolo.forwardStressAuc,
      stressAucCi95: m.scoreSolo.forwardStressAucCi95,
      monotonic: m.scoreSolo.stressDecilesMonotonic,
      deterioro: kind(m.scoreSolo.deterioro),
      recuperacion: kind(m.scoreSolo.recuperacion),
    },
    scoreGrupo: {
      spearman: m.scoreGrupo.forwardMarginSpearman,
      stressAuc: m.scoreGrupo.forwardStressAuc,
      stressAucCi95: m.scoreGrupo.forwardStressAucCi95,
      monotonic: m.scoreGrupo.stressDecilesMonotonic,
      deterioro: kind(m.scoreGrupo.deterioro),
      recuperacion: kind(m.scoreGrupo.recuperacion),
    },
    decision: {
      events: m.decision.eventos,
      avoidedExposure: m.decision.exposicionEvitada,
      simulatedRevenue: m.decision.ingresosSimulados,
      oscillation: m.decision.oscilacion,
      closes: m.decision.cierres,
      falseCloses: m.decision.cierresFalsos,
      closeLeadMedian: m.decision.leadTimeCierreMediano,
    },
  };
}
