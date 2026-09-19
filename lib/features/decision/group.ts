import { banda } from "@/lib/features/decision/limit";
import { redondearAbajo } from "@/lib/features/decision/money";
import { eur } from "@/lib/features/decision/motivos";
import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { Accion, Puerta } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";

/** Decisión del mes de una empresa, ya tomada, tal como la consume el ajuste de grupo (§9). */
export type DecisionMes = {
  company: string;
  accion: Accion;
  L: number;
  LVigente: number;
  bandaEfectiva: Banda;
  /** Puertas que la empresa falló este mes (§3): distingue un cierre propio de uno heredado. */
  puertasFallidas: Puerta[];
  /** `true` si la empresa llegaba al mes ya cerrada (`L_prev = 0`): su cierre no es un evento nuevo. */
  yaCerrada: boolean;
};

export type LimiteGrupo = {
  capacidad: number;
  limiteCap: number;
  limiteOp: number;
  banda: Banda;
  L: number;
};

/**
 * §9: el grupo se trata como una sola empresa sobre los flujos consolidados de `ScoreRow`
 * (`cobrosOpGrupoMedia6m`, `pagosOpGrupoMedia6m`, `servicioDeudaGrupoMedia6m`), iguales en todas
 * las filas del grupo para un mes dado. La capacidad de cuota adversa se recalcula aquí con el
 * estrés **del motor de decisión** (`DECISION_PARAMS.estresCobros/estresPagos/coberturaMin`,
 * decisión 40), el mismo que usa `capacidadCuotaAdv` de §4: el techo consolidado y el límite
 * individual tienen que medirse con la misma vara.
 *
 * Desviación documentada: `limiteOp` usa la media de 6 meses de cobros del grupo (no existe media
 * de 3 meses consolidada en `ScoreRow`), a diferencia de `limite()` de §4, que usa `cobrosOpMedia3m`.
 *
 * Banda del grupo: media de `score` ponderada por `cobrosOpMedia6m`; el recorte por confianza usa
 * la media de `confianza` con el mismo peso.
 */
export function limiteGrupo(rows: ScoreRow[]): LimiteGrupo {
  if (rows.length === 0) throw new Error("limiteGrupo: grupo vacío");
  const g = rows[0];
  const capacidad = Math.max(
    0,
    (P.estresCobros * g.cobrosOpGrupoMedia6m - P.estresPagos * g.pagosOpGrupoMedia6m) /
      P.coberturaMin -
      g.servicioDeudaGrupoMedia6m,
  );
  const limiteCap = capacidad * P.mesesLimiteCap;
  const limiteOp = P.anticipoPct * g.cobrosOpGrupoMedia6m * P.anticipoMeses;
  const peso = rows.reduce((a, r) => a + r.cobrosOpMedia6m, 0);
  const score =
    peso > 0
      ? rows.reduce((a, r) => a + r.score * r.cobrosOpMedia6m, 0) / peso
      : rows.reduce((a, r) => a + r.score, 0) / rows.length;
  const conf =
    peso > 0
      ? rows.reduce((a, r) => a + r.confianza * r.cobrosOpMedia6m, 0) / peso
      : rows.reduce((a, r) => a + r.confianza, 0) / rows.length;
  const b = banda(score);
  const L = redondearAbajo(
    Math.min(limiteCap, limiteOp) * P.factorBanda[b] * Math.min(1, conf / P.confRef),
    P.redondeoL,
  );
  return { capacidad, limiteCap, limiteOp, banda: b, L };
}

/**
 * Decisión 41: `"prorrateo"` es el techo clásico (`L_grupo > 0` y Σ por encima); `"bajaBanda"` es
 * el techo con capacidad consolidada 0, que baja una banda en vez de cerrar; `null`, sin techo.
 */
export type ModoTecho = "prorrateo" | "bajaBanda" | null;

export type AjusteGrupo = {
  decisiones: DecisionMes[];
  /** Empresas caídas con cross-default, en orden alfabético (salida determinista). */
  caidas: string[];
  afectadas: string[];
  /** Decisión 41: miembros vivos que bajan una banda porque `L_grupo = 0` (orden alfabético). */
  afectadasTecho: string[];
  modo: ModoTecho;
  motivoGrupo: string | null;
};

/** Decisión 41: texto del techo con capacidad consolidada nula, igual en la ficha y en el motivo. */
export const MOTIVO_TECHO_CERO = "Grupo sin capacidad consolidada: banda −1";

/**
 * §9: techo del grupo (si `Σ LVigente > L_grupo`, prorrateo redondeado abajo) y detección de
 * cross-default (cierre de una empresa con `D1 ≥ D1CrossDefault`).
 *
 * **Decisión 41**: con `L_grupo = 0` el prorrateo cerraría a todos los miembros, incluido el único
 * solvente. Las hermanas sin datos aportan pagos clasificados y pocos cobros, así que la caja
 * consolidada estresada se va a negativo por falta de dato, no por riesgo. Con capacidad
 * consolidada nula el grupo penaliza bajando **una banda** (−30 % de límite, +2 pp) y lo dice en
 * la ficha; el prorrateo se mantiene íntegro siempre que `L_grupo > 0`. Es la única opción
 * coherente con el aval: una filial puede recibir +10 puntos de aval del padre y no puede a la
 * vez quedar cerrada por el techo de ese mismo padre.
 *
 * Una *caída* es un cierre **nuevo y propio**, y por eso se descartan dos casos que si no
 * realimentan el contagio hasta el bloqueo mutuo:
 *
 * - Cierre cuya **única** puerta fallida es `grupo`: es el contagio que ya provocó otra empresa,
 *   no una caída nueva. Sin esta regla A tumba a B y el cierre de B vuelve a marcar a A.
 * - Empresa que llegaba al mes **ya cerrada** (`yaCerrada`): su cierre es el mismo evento del mes
 *   anterior. Sin esta regla la causa se redetecta cada mes y la bandera nunca deja de rearmarse.
 *
 * Puro: devuelve en `afectadas` las hermanas que sobreviven a una caída y en `afectadasTecho` las
 * que baja el techo cero, para que el motor (§9, paso 2) recompute su límite con los
 * `escalonesExtra` acumulados (máximo 2) y vuelva a aplicar el techo. Aquí no se baja ninguna
 * banda.
 */
export function ajusteGrupo(
  rows: ScoreRow[],
  decisiones: DecisionMes[],
  LGrupo: number,
): AjusteGrupo {
  const suma = decisiones.reduce((a, d) => a + d.LVigente, 0);
  let motivoGrupo: string | null = null;
  let ajustadas = decisiones;
  let modo: ModoTecho = null;
  let afectadasTecho: string[] = [];
  if (P.techoCeroBajaBanda && LGrupo === 0 && decisiones.some((d) => d.LVigente > 0)) {
    modo = "bajaBanda";
    afectadasTecho = decisiones
      .filter((d) => d.accion !== "cerrar")
      .map((d) => d.company)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    motivoGrupo = MOTIVO_TECHO_CERO;
  } else if (suma > LGrupo) {
    modo = "prorrateo";
    ajustadas = decisiones.map((d) => ({
      ...d,
      LVigente: redondearAbajo((d.LVigente * LGrupo) / suma, P.redondeoL),
    }));
    motivoGrupo = `Techo de grupo: ${eur(LGrupo)}`;
  }
  const D1 = new Map(rows.map((r) => [r.company, r.D1]));
  const caidas = decisiones
    .filter(
      (d) =>
        d.accion === "cerrar" &&
        !d.yaCerrada &&
        !(d.puertasFallidas.length === 1 && d.puertasFallidas[0] === "grupo") &&
        (D1.get(d.company) ?? 0) >= P.D1CrossDefault,
    )
    .map((d) => d.company)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const afectadas = caidas.length
    ? decisiones.filter((d) => !caidas.includes(d.company)).map((d) => d.company)
    : [];
  return { decisiones: ajustadas, caidas, afectadas, afectadasTecho, modo, motivoGrupo };
}
