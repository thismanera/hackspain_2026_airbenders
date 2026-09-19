import { decidirAccion, siguienteEstado, type Decision } from "@/lib/features/decision/action";
import { elegibilidad, type Elegibilidad } from "@/lib/features/decision/eligibility";
import { ajusteGrupo, limiteGrupo, type AjusteGrupo } from "@/lib/features/decision/group";
import { banda, peor } from "@/lib/features/decision/limit";
import { menu, plazoNatural } from "@/lib/features/decision/menu";
import { motivoAccion } from "@/lib/features/decision/motivos";
import { DECISION_PARAMS as P, hashDecisionParams } from "@/lib/features/decision/params";
import { tMax } from "@/lib/features/decision/tenor";
import {
  ESTADO_INICIAL,
  type DecisionParameters,
  type DecisionRow,
  type EstadoDecision,
  type PrevisionInput,
} from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

/** §10: la versión del motor es el hash de los parámetros de decisión más la versión del score. */
export function parametrosDecision(versionScoring: string): DecisionParameters {
  const paramsHash = hashDecisionParams(P);
  return {
    version: hashDecisionParams({ paramsHash, versionScoring }),
    paramsHash,
    versionScoring,
  };
}

/** Previsiones del forecast-engine (§1), indexadas por `${company}|${month}`. */
export type Previsiones = Map<string, PrevisionInput>;

/** Sin previsión conectada la banda prevista es la actual y `banda_pred_3m_usada` sale null (§10). */
function prevision(previsiones: Previsiones | undefined, r: ScoreRow): PrevisionInput {
  const p = previsiones?.get(`${r.company}|${r.month}`);
  if (!p || p.metodo === "desconectado")
    return {
      bandaPred3m: banda(r.score),
      scorePred3m: null,
      direccionPred: null,
      probDeterioro6m: null,
      metodo: "desconectado",
    };
  return p;
}

/**
 * §9: la bandera de cross-default se enciende el mes de la caída en las hermanas supervivientes y
 * se mantiene mientras la empresa causante siga cerrada (`LPrev === 0` en su estado de ESTE mes,
 * es decir su `L_vigente` del mes); se levanta el mes en que la causante reabre.
 */
export function crossDefaultSiguiente(
  prev: EstadoDecision,
  afectada: boolean,
  causa: string | null,
  estadosDelMes: ReadonlyMap<string, EstadoDecision>,
): Pick<EstadoDecision, "crossDefaultActivo" | "causaCrossDefault"> {
  const apagado = { crossDefaultActivo: false, causaCrossDefault: null } as const;
  if (afectada && causa) return { crossDefaultActivo: true, causaCrossDefault: causa };
  if (!prev.crossDefaultActivo || !prev.causaCrossDefault) return apagado;
  const causante = estadosDelMes.get(prev.causaCrossDefault);
  if (causante && causante.LPrev > 0) return apagado;
  return { crossDefaultActivo: true, causaCrossDefault: prev.causaCrossDefault };
}

type Candidata = {
  r: ScoreRow;
  prev: EstadoDecision;
  e: Elegibilidad;
  pred: PrevisionInput;
  d: Decision;
};

/** §9 paso 1 + 2; con una sola empresa no hay techo consolidado ni cross-default posible. */
function aplicarGrupo(
  rows: ScoreRow[],
  candidatas: Candidata[],
  LGrupo: number,
  enGrupo: boolean,
): AjusteGrupo {
  const decisiones = candidatas.map(({ r, d }) => ({
    company: r.company,
    accion: d.accion,
    L: d.L,
    LVigente: d.LVigente,
    bandaEfectiva: d.bandaEfectiva,
  }));
  if (!enGrupo) return { decisiones, caidas: new Set<string>(), afectadas: [], motivoGrupo: null };
  return ajusteGrupo(rows, decisiones, LGrupo);
}

function fila(
  x: Candidata,
  d: Decision,
  estado: EstadoDecision,
  params: DecisionParameters,
  motivoGrupo: string | null,
  causaCrossDefault: string | null,
): DecisionRow {
  const { r, e, pred, prev } = x;
  const T = d.accion === "cerrar" ? 0 : tMax(r, pred.bandaPred3m);
  const opciones = T === 0 ? [] : menu(r, d.LVigente, T, d.bandaEfectiva, pred.bandaPred3m);
  const bandaPred = pred.metodo === "desconectado" ? null : pred.bandaPred3m;
  return {
    company: r.company,
    month: r.month,
    groupId: r.groupId,
    motor: "v1",
    versionParametros: params.version,
    elegible: e.elegible && T > 0,
    motivo: !e.elegible
      ? e.motivo
      : T === 0
        ? // la banda que agota el plazo es la peor de la actual y la prevista (§5, decisión 37)
          `Deterioro estructural en banda ${peor(banda(r.score), pred.bandaPred3m)}`
        : opciones.length === 0 && d.LVigente > 0
          ? "Capacidad de cuota insuficiente para cualquier plazo"
          : null,
    puertasFallidas: e.puertasFallidas,
    banda: banda(r.score),
    bandaEfectiva: d.bandaEfectiva,
    capacidadCuotaAdv: r.capacidadCuotaAdv,
    limiteCap: d.limite.limiteCap,
    limiteOp: d.limite.limiteOp,
    L: d.L,
    LVigente: d.LVigente,
    TMax: T,
    menu: opciones,
    plazoNaturalAnticipo: plazoNatural(r),
    accion: d.accion,
    motivoAccion: motivoAccion(d.accion, r, {
      banda: d.bandaEfectiva,
      L: d.L,
      LPrev: prev.LPrev,
      LVigente: d.LVigente,
      TMax: T,
      motivoCierre: e.motivo,
      causaReduccion: d.causaReduccion,
      causaCrossDefault,
      bandaPred,
      mesesParaReapertura: d.mesesParaReapertura,
    }),
    motivoGrupo,
    bandaPred3mUsada: bandaPred,
    estado,
  };
}

/**
 * decision-engine §12: todas las filas de score de UN grupo (todas sus empresas, todos los meses).
 * Por mes, en orden de calendario: decidir cada empresa con su estado del mes anterior → techo de
 * grupo y cross-default (§9) → estado siguiente. Puro y determinista: sin fecha del sistema.
 */
export function decideGroup(
  scoreRows: ScoreRow[],
  params: DecisionParameters,
  previsiones?: Previsiones,
): DecisionRow[] {
  const porMes = new Map<string, ScoreRow[]>();
  for (const r of scoreRows) {
    const lista = porMes.get(r.month);
    if (lista) lista.push(r);
    else porMes.set(r.month, [r]);
  }
  const estados = new Map<string, EstadoDecision>();
  const out: DecisionRow[] = [];

  for (const month of CALENDAR) {
    const rows = [...(porMes.get(month) ?? [])].sort((a, b) => a.company.localeCompare(b.company));
    if (!rows.length) continue;
    const enGrupo = rows.length > 1;
    const LGrupo = enGrupo ? limiteGrupo(rows).L : Infinity;

    const decide = (r: ScoreRow, escalonesExtra: number): Candidata => {
      const prev = estados.get(r.company) ?? ESTADO_INICIAL;
      const e = elegibilidad(r, prev);
      const pred = prevision(previsiones, r);
      return { r, prev, e, pred, d: decidirAccion(r, e, pred.bandaPred3m, prev, escalonesExtra) };
    };

    let candidatas = rows.map((r) => decide(r, 0));
    let ajuste = aplicarGrupo(rows, candidatas, LGrupo, enGrupo);
    if (ajuste.afectadas.length) {
      // §9: las hermanas de una caída bajan un escalón de banda y se recalcula el techo.
      candidatas = candidatas.map((x) =>
        ajuste.afectadas.includes(x.r.company) ? decide(x.r, 1) : x,
      );
      ajuste = aplicarGrupo(rows, candidatas, LGrupo, enGrupo);
    }
    const causa = [...ajuste.caidas].sort()[0] ?? null;
    const LVigentes = new Map(ajuste.decisiones.map((d) => [d.company, d.LVigente]));

    // Primero el estado de todas (§8) y luego el cross-default, que mira el mes ya cerrado.
    const cerradas = candidatas.map((x) => {
      const d = { ...x.d, LVigente: LVigentes.get(x.r.company) ?? x.d.LVigente };
      return { x, d, siguiente: siguienteEstado(x.prev, d, x.r, x.pred.bandaPred3m) };
    });
    const siguientes = new Map(cerradas.map(({ x, siguiente }) => [x.r.company, siguiente]));
    for (const { x, d, siguiente } of cerradas) {
      const estado: EstadoDecision = {
        ...siguiente,
        ...crossDefaultSiguiente(x.prev, ajuste.afectadas.includes(x.r.company), causa, siguientes),
      };
      estados.set(x.r.company, estado);
      out.push(fila(x, d, estado, params, ajuste.motivoGrupo, x.prev.causaCrossDefault ?? causa));
    }
  }
  return out;
}
