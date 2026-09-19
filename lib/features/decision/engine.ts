import { decidirAccion, siguienteEstado, type Decision } from "@/lib/features/decision/action";
import { elegibilidad, type Elegibilidad } from "@/lib/features/decision/eligibility";
import { ajusteGrupo, limiteGrupo, type AjusteGrupo } from "@/lib/features/decision/group";
import { proyectar } from "@/lib/features/decision/input";
import { banda, esPeor, peor } from "@/lib/features/decision/limit";
import { menu, plazoNatural } from "@/lib/features/decision/menu";
import { motivoAccion } from "@/lib/features/decision/motivos";
import { DECISION_PARAMS as P, hashDecisionParams } from "@/lib/features/decision/params";
import { tMax } from "@/lib/features/decision/tenor";
import {
  ESTADO_INICIAL,
  type DecisionInput,
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
function prevision(previsiones: Previsiones | undefined, r: DecisionInput): PrevisionInput {
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

type BloqueCrossDefault = Pick<
  EstadoDecision,
  "crossDefaultActivo" | "causaCrossDefault" | "mesesConCrossDefault"
>;
const SIN_CROSS_DEFAULT: BloqueCrossDefault = {
  crossDefaultActivo: false,
  causaCrossDefault: null,
  mesesConCrossDefault: 0,
};

/**
 * §9: la bandera de cross-default se enciende el mes de la caída en las hermanas supervivientes y
 * tiene **dos** reglas de levantamiento, las dos del documento:
 *
 * 1. La empresa causante reabre (`LPrev > 0` en su estado de ESTE mes, es decir su `L_vigente`
 *    del mes).
 * 2. La afectada lleva `reaperturaMeses` meses seguidos con la bandera encendida
 *    (`mesesConCrossDefault`). Sin este tope, una causante que nunca reabre dejaría a la hermana
 *    cerrada para siempre; al levantarse, la empresa vuelve por el camino normal de reapertura.
 *
 * Una caída **nueva** (`afectada && causa`) rearma la bandera con el contador a 1 solo si la causa
 * es distinta de la que ya estaba bloqueando; la misma causa sigue sumando meses (si no, el tope
 * nunca se alcanzaría). Si la causante no tiene fila este mes se levanta la bandera (fail-open):
 * sin dato del grupo preferimos no mantener cerrada a una empresa que sí pasa sus seis puertas.
 */
export function crossDefaultSiguiente(
  prev: EstadoDecision,
  afectada: boolean,
  causa: string | null,
  estadosDelMes: ReadonlyMap<string, EstadoDecision>,
): BloqueCrossDefault {
  const nueva = afectada && causa !== null && causa !== prev.causaCrossDefault;
  if (nueva) return { crossDefaultActivo: true, causaCrossDefault: causa, mesesConCrossDefault: 1 };
  if (!prev.crossDefaultActivo || !prev.causaCrossDefault) return SIN_CROSS_DEFAULT;
  if (prev.mesesConCrossDefault >= P.reaperturaMeses) return SIN_CROSS_DEFAULT;
  const causante = estadosDelMes.get(prev.causaCrossDefault);
  if (!causante || causante.LPrev > 0) return SIN_CROSS_DEFAULT;
  return {
    crossDefaultActivo: true,
    causaCrossDefault: prev.causaCrossDefault,
    mesesConCrossDefault: prev.mesesConCrossDefault + 1,
  };
}

type Candidata = {
  r: DecisionInput;
  prev: EstadoDecision;
  e: Elegibilidad;
  pred: PrevisionInput;
  d: Decision;
};

/** §9 paso 1 + 2; con una sola empresa no hay techo consolidado ni cross-default posible. */
function aplicarGrupo(
  rows: DecisionInput[],
  candidatas: Candidata[],
  LGrupo: number,
  enGrupo: boolean,
): AjusteGrupo {
  const decisiones = candidatas.map(({ r, d, e, prev }) => ({
    company: r.company,
    accion: d.accion,
    L: d.L,
    LVigente: d.LVigente,
    bandaEfectiva: d.bandaEfectiva,
    puertasFallidas: e.puertasFallidas,
    yaCerrada: prev.LPrev === 0,
  }));
  if (!enGrupo) return { decisiones, caidas: [], afectadas: [], modo: null, motivoGrupo: null };
  return ajusteGrupo(rows, decisiones, LGrupo);
}

/**
 * §9 paso 1: el techo del grupo recorta `L_vigente` **después** de decidir la acción, así que una
 * fila puede quedarse diciendo "mantener" con menos límite del que tenía. Se re-deriva la acción
 * para que la ficha no mienta: bajada por debajo de `L_prev` ⇒ `reducir` por `grupo`; prorrateo a
 * cero con la empresa elegible ⇒ `cerrar` (el motivo lo pone `fila` con `motivoGrupo`).
 */
function aplicarTecho(d: Decision, LVigente: number, prev: EstadoDecision): Decision {
  if (LVigente === d.LVigente) return d;
  const ajustada: Decision = { ...d, LVigente };
  if (LVigente === 0)
    return { ...ajustada, accion: "cerrar", causaReduccion: "grupo", cierrePendiente: false };
  if (
    LVigente < prev.LPrev &&
    (d.accion === "abrir" || d.accion === "ampliar" || d.accion === "mantener")
  )
    return { ...ajustada, accion: "reducir", causaReduccion: "grupo" };
  // El techo se comió la subida entera: la fila no puede decir "ampliar" con el mismo límite.
  if (d.accion === "ampliar" && LVigente <= prev.LPrev) return { ...ajustada, accion: "mantener" };
  return ajustada;
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
  // La empresa pasa las seis puertas pero el techo del grupo la dejó en cero (§9): el motivo del
  // cierre es el del grupo, no una puerta de elegibilidad.
  const cerradoPorGrupo = e.elegible && d.accion === "cerrar";
  const motivoCierre = cerradoPorGrupo ? motivoGrupo : e.motivo;
  // §7 + §10: "elegible" significa que hay grifo que abrir, así que un menú vacío nunca sale
  // elegible y una fila elegible nunca lleva motivo. Con las seis puertas pasadas y `L_vigente`
  // en cero (espera de reapertura o L = 0 por banda D / capacidad nula) el motivo lo pone la
  // espera, no una puerta.
  const elegible = e.elegible && T > 0 && opciones.length > 0;
  const motivo = !e.elegible
    ? e.motivo
    : cerradoPorGrupo
      ? motivoCierre
      : T === 0
        ? // la banda que agota el plazo es la peor de la actual y la prevista (§5, decisión 37):
          // si la peor es la prevista, quien agota el plazo es la previsión, no el deterioro de hoy
          esPeor(pred.bandaPred3m, banda(r.score))
          ? `Previsión: banda ${pred.bandaPred3m} en 3 meses`
          : `Deterioro estructural en banda ${peor(banda(r.score), pred.bandaPred3m)}`
        : opciones.length > 0
          ? null
          : d.LVigente > 0
            ? "Límite por debajo del escalón mínimo en todos los plazos"
            : d.mesesParaReapertura !== null
              ? `Reapertura en ${d.mesesParaReapertura} meses`
              : "Límite a cero";
  return {
    company: r.company,
    month: r.month,
    groupId: r.groupId,
    motor: "v1",
    versionParametros: params.version,
    elegible,
    motivo,
    puertasFallidas: e.puertasFallidas,
    cierrePendiente: d.cierrePendiente,
    banda: banda(r.score),
    bandaEfectiva: d.bandaEfectiva,
    // Decisión 43 + 45: la ficha publica la escala con la que se ha decidido y el recorte por el
    // pilar A, no una capacidad de cuota en euros que el motor ya no calcula.
    tamano: r.tamano,
    factorA: d.limite.factorA,
    limiteOp: d.limite.limiteOp,
    L: d.L,
    LVigente: d.LVigente,
    TMax: T,
    menu: opciones,
    plazoNaturalAnticipo: plazoNatural(),
    accion: d.accion,
    motivoAccion: motivoAccion(d.accion, r, {
      banda: d.bandaEfectiva,
      L: d.L,
      LPrev: prev.LPrev,
      LVigente: d.LVigente,
      TMax: T,
      motivoCierre,
      causaReduccion: d.causaReduccion,
      causaCrossDefault,
      bandaPred,
      mesesParaReapertura: d.mesesParaReapertura,
      cierrePendiente: d.cierrePendiente,
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
 *
 * La propiedad 3 de §13 (`|L_vigente − L_prev| ≤ 25 % · L_prev`) no aplica a `cerrar`, a `reducir`
 * por deterioro estructural ni a `reducir` por `grupo`: el escalón de cross-default y el prorrateo
 * del techo consolidado se aplican el mismo mes, sin histéresis.
 */
export function decideGroup(
  scoreRows: ScoreRow[],
  params: DecisionParameters,
  previsiones?: Previsiones,
): DecisionRow[] {
  // Decisión 43: `proyectar` es la frontera del motor. A partir de aquí nadie ve un `ScoreRow`.
  const entradas = scoreRows.map(proyectar);
  const porMes = new Map<string, DecisionInput[]>();
  const groupId = entradas[0]?.groupId;
  for (const r of entradas) {
    if (r.groupId !== groupId)
      throw new Error(`decideGroup: fila de otro grupo (${r.groupId} != ${groupId})`);
    if (!CALENDAR.includes(r.month))
      throw new Error(`decideGroup: mes fuera del calendario (${r.month})`);
    const lista = porMes.get(r.month);
    if (lista) lista.push(r);
    else porMes.set(r.month, [r]);
  }
  const estados = new Map<string, EstadoDecision>();
  const out: DecisionRow[] = [];

  for (const month of CALENDAR) {
    const rows = [...(porMes.get(month) ?? [])].sort((a, b) =>
      a.company < b.company ? -1 : a.company > b.company ? 1 : 0,
    );
    if (!rows.length) continue;
    const enGrupo = rows.length > 1;
    const LGrupo = enGrupo ? limiteGrupo(rows).L : Infinity;

    const decide = (r: DecisionInput, escalonesExtra: number): Candidata => {
      const prev = estados.get(r.company) ?? ESTADO_INICIAL;
      const e = elegibilidad(r, prev);
      const pred = prevision(previsiones, r);
      return { r, prev, e, pred, d: decidirAccion(r, e, pred.bandaPred3m, prev, escalonesExtra) };
    };

    let candidatas = rows.map((r) => decide(r, 0));
    let ajuste = aplicarGrupo(rows, candidatas, LGrupo, enGrupo);
    // §9 paso 2: la caída de una hermana baja un escalón de banda a las supervivientes y se
    // recalcula el techo. El escalón no deriva un `cerrar`: eso lo hace la puerta `grupo` del mes
    // siguiente. Decisión 47: el escalón del techo cero (decisión 41) ya no existe, así que el
    // recorte es como mucho de una banda.
    if (ajuste.afectadas.length) {
      const afectadas = new Set(ajuste.afectadas);
      candidatas = candidatas.map((x) => (afectadas.has(x.r.company) ? decide(x.r, 1) : x));
      ajuste = aplicarGrupo(rows, candidatas, LGrupo, enGrupo);
    }
    // Con varias caídas manda la mayor del grupo por `D1` (empate: alfabético).
    const D1 = new Map(rows.map((r) => [r.company, r.D1]));
    const causa =
      [...ajuste.caidas].sort(
        (a, b) => (D1.get(b) ?? 0) - (D1.get(a) ?? 0) || (a < b ? -1 : a > b ? 1 : 0),
      )[0] ?? null;
    const LVigentes = new Map(ajuste.decisiones.map((d) => [d.company, d.LVigente]));

    // Primero el estado de todas (§8) y luego el cross-default, que mira el mes ya cerrado.
    const cerradas = candidatas.map((x) => {
      const d = aplicarTecho(x.d, LVigentes.get(x.r.company) ?? x.d.LVigente, x.prev);
      return { x, d, siguiente: siguienteEstado(x.prev, d, x.r, x.pred.bandaPred3m, x.e) };
    });
    const siguientes = new Map(cerradas.map(({ x, siguiente }) => [x.r.company, siguiente]));
    for (const { x, d, siguiente } of cerradas) {
      const estado: EstadoDecision = {
        ...siguiente,
        ...crossDefaultSiguiente(x.prev, ajuste.afectadas.includes(x.r.company), causa, siguientes),
      };
      estados.set(x.r.company, estado);
      // Un solo valor de causa para el motivo y para el estado: la que acaba de bloquear a la
      // empresa, o la que ya venía bloqueándola si este mes no ha caído nadie nuevo.
      const causaFila = estado.causaCrossDefault ?? x.prev.causaCrossDefault;
      out.push(fila(x, d, estado, params, ajuste.motivoGrupo, causaFila));
    }
  }
  return out;
}
