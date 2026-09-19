import { banda } from "@/lib/features/decision/limit";
import { direccionPred, intervalo, probDeterioro } from "@/lib/features/forecast/interval";
import {
  type ForecastParameters,
  HORIZONTES,
  type Horizonte,
} from "@/lib/features/forecast/params";
import {
  type CompanyCtx,
  type Proyeccion,
  proyectarEmpresa,
} from "@/lib/features/forecast/project";
import { cascada, d2Pred, drivers, recomponer, scorePred } from "@/lib/features/forecast/recompose";
import type {
  ForecastGroupInput,
  ForecastRow,
  HorizonForecast,
} from "@/lib/features/forecast/types";
import type { Aggregated } from "@/lib/features/scoring/aggregate";
import { PARAMS } from "@/lib/features/scoring/params";
import type { Percentiles, ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR, monthIndex } from "@/lib/features/scoring/windows";

type Staged = { proy: Proyeccion; agg: Aggregated };

/**
 * forecast-engine §7: por mes de calendario, primera pasada por empresa (proyección + recomposición
 * de `score_solo`), segunda pasada con las hermanas ya proyectadas (D2 previsto → aval → score) y
 * por último intervalo, dirección y `prob_deterioro_6m`. Regla de oro: en `t` solo se leen filas y
 * flujos `≤ t`. `percentiles` son los p5/p95 congelados de scoring (misma `versionParametros`).
 */
export function forecastGroup(
  input: ForecastGroupInput,
  params: ForecastParameters,
  percentiles: Percentiles,
): ForecastRow[] {
  const byCompany = new Map<string, (ScoreRow | undefined)[]>();
  for (const r of input.rows) {
    if (r.groupId !== input.groupId)
      throw new Error(`forecastGroup: fila de otro grupo (${r.groupId} != ${input.groupId})`);
    const i = monthIndex(r.month);
    if (i === -1) throw new Error(`forecastGroup: mes fuera del calendario (${r.month})`);
    const list =
      byCompany.get(r.company) ?? Array<ScoreRow | undefined>(CALENDAR.length).fill(undefined);
    list[i] = r;
    byCompany.set(r.company, list);
  }
  const companies = [...byCompany.keys()].sort();
  const out: ForecastRow[] = [];

  for (let t = 0; t < CALENDAR.length; t++) {
    const present = companies.filter((c) => byCompany.get(c)![t]);
    if (!present.length) continue;
    // Primera pasada: proyección y score_solo previsto de cada empresa y horizonte.
    const stage = new Map<string, Record<Horizonte, Staged>>();
    for (const c of present) {
      const ctx: CompanyCtx = { rows: byCompany.get(c)!, flows: input.flows.get(c) ?? [], t };
      const porH = {} as Record<Horizonte, Staged>;
      for (const h of HORIZONTES) {
        const proy = proyectarEmpresa(ctx, h, params.clip);
        porH[h] = { proy, agg: recomponer(proy.vars, proy.rachaB2Prev, percentiles) };
      }
      stage.set(c, porH);
    }
    // Segunda pasada: hermanas = las demás con evidencia en t (scoring §14), D2 previsto, aval, score.
    for (const c of present) {
      const me = byCompany.get(c)![t]!;
      const hermanas = present.filter((o) => {
        if (o === c) return false;
        const r = byCompany.get(o)![t]!;
        return r.D1 > 0 || r.confianza >= PARAMS.confSinDatos;
      });
      const horizontes = {} as Record<Horizonte, HorizonForecast>;
      for (const h of HORIZONTES) {
        const { proy, agg } = stage.get(c)![h];
        const D2 = d2Pred(
          me,
          hermanas.map((o) => ({
            row: byCompany.get(o)![t]!,
            scoreSoloPred: stage.get(o)![h].agg.scoreSolo,
          })),
        );
        const score = scorePred(agg.scoreSolo, me, D2);
        const casc = cascada(agg, me, D2, score);
        horizontes[h] = {
          scorePred: score,
          bandaPred: banda(score),
          ...intervalo(score, h, banda(me.score), params.residuos),
          cascadaPred: casc,
          drivers: drivers(me.variables, casc),
          rachaDeficitPred: proy.rachaDeficitPred,
          rachaB2Pred: proy.rachaB2Pred,
        };
      }
      out.push({
        company: c,
        month: CALENDAR[t],
        groupId: input.groupId,
        versionParametros: params.version,
        horizontes,
        direccionPred: direccionPred(horizontes[3].scorePred, me.score),
        probDeterioro6m: probDeterioro(banda(me.score), horizontes[3].bandaPred, params.pDet),
        sinTendencia: stage.get(c)![3].proy.sinTendencia,
        metodo: params.conectado ? "v1_proyeccion" : "desconectado",
      });
    }
  }
  return out;
}
