import { banda } from "@/lib/features/decision/limit";
import { direccionPred, intervalo, probDeterioro } from "@/lib/features/forecast/interval";
import {
  FORECAST_PARAMS as P,
  type ForecastParameters,
  HORIZONTES,
  type Horizonte,
} from "@/lib/features/forecast/params";
import { type CompanyCtx, proyectarEmpresa } from "@/lib/features/forecast/project";
import {
  drivers,
  d2Pred,
  holdingContribution,
  recomponer,
} from "@/lib/features/forecast/recompose";
import type {
  ForecastContribution,
  ForecastGroupInput,
  ForecastRow,
  HorizonForecast,
} from "@/lib/features/forecast/types";
import { ajusteHolding, type GroupMember } from "@/lib/features/scoring/group";
import type { Aggregated } from "@/lib/features/scoring/aggregate";
import { PARAMS } from "@/lib/features/scoring/params";
import type { Percentiles, ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR, clamp, monthIndex } from "@/lib/features/scoring/windows";

type Staged = { proy: ReturnType<typeof proyectarEmpresa>; agg: Aggregated; row: ScoreRow };

function memberAt(row: ScoreRow, capacity: number, scoreSolo: number): GroupMember {
  return {
    company: row.company,
    scoreSolo,
    confianza: row.confianza,
    cobrosOp12m: row.cobrosOpMedia6m * 12,
    pagosOp12m: row.pagosOpMedia6m * 12,
    capacidadCuotaAdv: row.capacidadCuotaAdv,
    obligacionesMedia6m: row.servicioDeudaMedia6m + row.obligacionesRecMedia6m,
    cobrosOpMedia6m: row.cobrosOpMedia6m,
    pagosOpMedia6m: row.pagosOpMedia6m,
    servicioDeudaMedia6m: row.servicioDeudaMedia6m,
    capacidadNeta6m: capacity,
    intragrupoIn12m: 0,
    intragrupoOut12m: 0,
    A1: row.variables.find((v) => v.id === "A1")?.raw,
    margenMes: row.margenMes,
    rachaB2: row.rachaB2,
    b2Observed: row.variables.find((v) => v.id === "B2")?.raw != null,
  };
}

function actualCascade(row: ScoreRow): ForecastContribution[] {
  return [...row.variables, holdingContribution(row, row.ajusteHolding, row.D2)];
}

function projectedCascade(
  agg: Aggregated,
  row: ScoreRow,
  adjustment: number,
  d2: number | null,
): ForecastContribution[] {
  return [...agg.contributions, holdingContribution(row, adjustment, d2)];
}

export function forecastGroup(
  input: ForecastGroupInput,
  params: ForecastParameters,
  percentiles: Percentiles,
): ForecastRow[] {
  const byCompany = new Map<string, (ScoreRow | undefined)[]>();
  for (const row of input.rows) {
    if (row.groupId !== input.groupId)
      throw new Error(`forecastGroup: fila de otro grupo (${row.groupId} != ${input.groupId})`);
    const i = monthIndex(row.month);
    if (i === -1) throw new Error(`forecastGroup: mes fuera del calendario (${row.month})`);
    const list =
      byCompany.get(row.company) ?? Array<ScoreRow | undefined>(CALENDAR.length).fill(undefined);
    if (list[i]) throw new Error(`forecastGroup: fila duplicada (${row.company}, ${row.month})`);
    list[i] = row;
    byCompany.set(row.company, list);
  }
  const companies = [...byCompany.keys()].sort();
  const output: ForecastRow[] = [];
  for (let t = 0; t < CALENDAR.length; t++) {
    const present = companies.filter((company) => byCompany.get(company)![t]);
    if (!present.length) continue;
    const staged = new Map<string, Record<Horizonte, Staged>>();
    for (const company of present) {
      const row = byCompany.get(company)![t]!;
      const ctx: CompanyCtx = {
        rows: byCompany.get(company)!,
        flows: input.flows.get(company) ?? [],
        t,
      };
      const horizons = {} as Record<Horizonte, Staged>;
      for (const h of HORIZONTES) {
        const proy = proyectarEmpresa(ctx, h, params.clip);
        horizons[h] = {
          row,
          proy,
          agg: recomponer(proy.vars, proy.rachaB2Prev, percentiles, row.cobertura),
        };
      }
      staged.set(company, horizons);
    }
    for (const company of present) {
      const row = byCompany.get(company)![t]!;
      const siblings = present.filter((other) => {
        if (other === company) return false;
        const sibling = byCompany.get(other)![t]!;
        return sibling.D1 > 0 || sibling.confianza >= PARAMS.confSinDatos;
      });
      const horizons = {} as Record<Horizonte, HorizonForecast>;
      for (const h of HORIZONTES) {
        const own = staged.get(company)![h];
        const predictedSolo = own.agg.scoreSolo;
        const predictedSiblings = siblings.map((other) => ({
          row: byCompany.get(other)![t]!,
          scoreSoloPred: staged.get(other)![h].agg.scoreSolo,
        }));
        const d2 = d2Pred(row, predictedSiblings);
        const meMember = memberAt(row, own.proy.capacidadNetaPred, predictedSolo);
        const siblingMembers = siblings.map((other) => {
          const siblingRow = byCompany.get(other)![t]!;
          const siblingStage = staged.get(other)![h];
          return memberAt(
            siblingRow,
            siblingStage.proy.capacidadNetaPred,
            siblingStage.agg.scoreSolo,
          );
        });
        const proposedAdjustment =
          d2 === null || !siblingMembers.length
            ? 0
            : ajusteHolding(meMember, siblingMembers, d2, row.D5);
        const predictedGroup = clamp(predictedSolo + proposedAdjustment, 0, 100);
        // La aportación efectiva del holding es la que conserva la descomposición dentro de
        // [0,100] cuando el score autónomo está cerca de un extremo; no publicamos un ajuste que
        // deje la cascada por encima de la nota de grupo acotada.
        const adjustment = Number((predictedGroup - predictedSolo).toFixed(12));
        const soloInterval = intervalo(
          predictedSolo,
          h,
          banda(row.scoreSolo),
          params.solo.residuos,
        );
        const groupInterval = intervalo(
          predictedGroup,
          h,
          banda(row.scoreGrupo),
          params.grupo.residuos,
        );
        const current = actualCascade(row);
        const predicted = projectedCascade(own.agg, row, adjustment, d2);
        const soloDrivers = drivers(current.slice(0, -1), predicted.slice(0, -1));
        const groupDrivers = drivers(current, predicted);
        horizons[h] = {
          scoreSoloPred: predictedSolo,
          bandaSoloPred: banda(predictedSolo),
          p10Solo: soloInterval.p10,
          p90Solo: soloInterval.p90,
          scoreGrupoPred: predictedGroup,
          bandaGrupoPred: banda(predictedGroup),
          p10Grupo: groupInterval.p10,
          p90Grupo: groupInterval.p90,
          ajusteHoldingPred: adjustment,
          cascadaPred: predicted,
          driversSolo: soloDrivers,
          driversGrupo: groupDrivers,
          rachaDeficitPred: own.proy.rachaDeficitPred,
          rachaB2Pred: own.proy.rachaB2Pred,
          scorePred: predictedGroup,
          bandaPred: banda(predictedGroup),
          p10: groupInterval.p10,
          p90: groupInterval.p90,
          drivers: groupDrivers,
        };
      }
      const h3 = horizons[P.horizonteDecision];
      const soloMethod = params.solo.conectado ? "v1_proyeccion" : "desconectado";
      const groupMethod = params.grupo.conectado ? "v1_proyeccion" : "desconectado";
      output.push({
        company,
        month: CALENDAR[t],
        groupId: input.groupId,
        versionParametros: params.version,
        horizontes: horizons,
        direccionSoloPred: direccionPred(h3.scoreSoloPred, row.scoreSolo),
        direccionGrupoPred: direccionPred(h3.scoreGrupoPred, row.scoreGrupo),
        probDeterioroSolo6m: probDeterioro(
          banda(row.scoreSolo),
          h3.bandaSoloPred,
          params.solo.pDet,
        ),
        probDeterioroGrupo6m: probDeterioro(
          banda(row.scoreGrupo),
          h3.bandaGrupoPred,
          params.grupo.pDet,
        ),
        sinTendencia: staged.get(company)![P.horizonteDecision].proy.sinTendencia,
        metodoSolo: soloMethod,
        metodoGrupo: groupMethod,
        direccionPred: direccionPred(h3.scoreGrupoPred, row.scoreGrupo),
        probDeterioro6m: probDeterioro(banda(row.scoreGrupo), h3.bandaGrupoPred, params.grupo.pDet),
        metodo: soloMethod === groupMethod ? soloMethod : "desconectado",
      });
    }
  }
  return output;
}
