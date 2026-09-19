import { banda } from "@/lib/features/decision/limit";
import { metricasDecision } from "@/lib/features/decision/metrics";
import type { DecisionRow } from "@/lib/features/decision/types";
import { FORECAST_PARAMS as P, HORIZONTES, type Horizonte } from "@/lib/features/forecast/params";
import type { ForecastRow } from "@/lib/features/forecast/types";
import { detectEvents } from "@/lib/features/scoring/backtest";
import type { ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR, monthIndex } from "@/lib/features/scoring/windows";

export type HorizonteBacktest = {
  filas: number;
  mae: number | null;
  maeBaseline: number | null;
  aciertoBanda: number | null;
  aciertoBandaBaseline: number | null;
  coberturaIntervalo: number | null;
};
export type ForecastBacktest = {
  targetScore: "scoreSolo" | "scoreGrupo";
  horizontes: Record<Horizonte, HorizonteBacktest>;
  ventanas: Record<Horizonte, [string, string]>;
  leadTime: { conPrevision: number | null; sinPrevision: number | null };
  reduccionesPreventivas: number;
  falsasReduccionesPreventivas: number;
  /** falsas / preventivas (§9); `null` si no hubo ninguna reducción preventiva. */
  ratioFalsasPreventivas: number | null;
};

/**
 * forecast-engine §9 sobre las filas que se le pasan (el script filtra validación). `ventanas[h]`
 * acota el mes `t` de la previsión (ambos inclusive); solo cuentan pares con fila real en `t + h`.
 * Las decisiones con y sin previsión sirven para el lead time (decision §14) y para contar las
 * reducciones preventivas: `reducir` con previsión donde sin ella no se reducía ni cerraba. De
 * ellas, `falsas` son las que no van seguidas de un deterioro en `ventanaEvento` meses, y
 * `ratioFalsasPreventivas` es su proporción (§9 pide subir `reducir_prev_meses` si pasa del 40 %).
 */
export function backtestForecast(
  scores: ScoreRow[],
  forecasts: ForecastRow[],
  decisionesCon: DecisionRow[],
  decisionesSin: DecisionRow[],
  ventanas: Record<Horizonte, [string, string]>,
  targetScore: "scoreSolo" | "scoreGrupo" = "scoreSolo",
): ForecastBacktest {
  const byKey = new Map(scores.map((r) => [`${r.company}|${r.month}`, r]));
  const horizontes = {} as Record<Horizonte, HorizonteBacktest>;
  for (const h of HORIZONTES) {
    const [desde, hasta] = ventanas[h];
    let n = 0;
    let errV1 = 0;
    let errBase = 0;
    let bandaOk = 0;
    let bandaBaseOk = 0;
    let dentro = 0;
    for (const f of forecasts) {
      if (f.month < desde || f.month > hasta) continue;
      const t = monthIndex(f.month);
      if (t < 0) continue;
      const real = byKey.get(`${f.company}|${CALENDAR[t + h]}`);
      const ahora = byKey.get(`${f.company}|${f.month}`);
      if (!real || !ahora) continue;
      const x = f.horizontes[h];
      n++;
      const realScore = real[targetScore];
      const nowScore = ahora[targetScore];
      const predictedScore = targetScore === "scoreSolo" ? x.scoreSoloPred : x.scoreGrupoPred;
      const predictedBand = targetScore === "scoreSolo" ? x.bandaSoloPred : x.bandaGrupoPred;
      const p10 = targetScore === "scoreSolo" ? x.p10Solo : x.p10Grupo;
      const p90 = targetScore === "scoreSolo" ? x.p90Solo : x.p90Grupo;
      errV1 += Math.abs(realScore - predictedScore);
      errBase += Math.abs(realScore - nowScore);
      if (banda(realScore) === predictedBand) bandaOk++;
      if (banda(realScore) === banda(nowScore)) bandaBaseOk++;
      if (realScore >= p10 && realScore <= p90) dentro++;
    }
    const ratio = (v: number) => (n ? v / n : null);
    horizontes[h] = {
      filas: n,
      mae: ratio(errV1),
      maeBaseline: ratio(errBase),
      aciertoBanda: ratio(bandaOk),
      aciertoBandaBaseline: ratio(bandaBaseOk),
      coberturaIntervalo: ratio(dentro),
    };
  }
  const sinByKey = new Map(decisionesSin.map((d) => [`${d.company}|${d.month}`, d]));
  const eventos = new Map<string, number[]>();
  for (const e of detectEvents(scores).filter((e) => e.kind === "deterioro")) {
    const list = eventos.get(e.company) ?? [];
    list.push(monthIndex(e.month));
    eventos.set(e.company, list);
  }
  let preventivas = 0;
  let falsas = 0;
  for (const d of decisionesCon) {
    if (d.accion !== "reducir") continue;
    const sin = sinByKey.get(`${d.company}|${d.month}`);
    if (!sin || sin.accion === "reducir" || sin.accion === "cerrar") continue;
    preventivas++;
    const t = monthIndex(d.month);
    if (!(eventos.get(d.company) ?? []).some((e) => e > t && e <= t + P.ventanaEvento)) falsas++;
  }
  return {
    targetScore,
    horizontes,
    ventanas,
    leadTime: {
      conPrevision: decisionesCon.length
        ? metricasDecision(scores, decisionesCon).leadTimeCierreMediano
        : null,
      sinPrevision: decisionesSin.length
        ? metricasDecision(scores, decisionesSin).leadTimeCierreMediano
        : null,
    },
    reduccionesPreventivas: preventivas,
    falsasReduccionesPreventivas: falsas,
    ratioFalsasPreventivas: preventivas ? falsas / preventivas : null,
  };
}
