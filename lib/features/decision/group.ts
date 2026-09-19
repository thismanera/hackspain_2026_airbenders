import { banda } from "@/lib/features/decision/limit";
import { redondearAbajo } from "@/lib/features/decision/money";
import { eur } from "@/lib/features/decision/motivos";
import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { Accion, Puerta } from "@/lib/features/decision/types";
import { PARAMS as S } from "@/lib/features/scoring/params";
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
 * las filas del grupo para un mes dado. La capacidad de cuota adversa se recalcula aquí con los
 * mismos parámetros de estrés que usa scoring (`estresCobros`, `estresPagos`, `coberturaMin`).
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
    (S.estresCobros * g.cobrosOpGrupoMedia6m - S.estresPagos * g.pagosOpGrupoMedia6m) /
      S.coberturaMin -
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

export type AjusteGrupo = {
  decisiones: DecisionMes[];
  /** Empresas caídas con cross-default, en orden alfabético (salida determinista). */
  caidas: string[];
  afectadas: string[];
  motivoGrupo: string | null;
};

/**
 * §9: techo del grupo (si `Σ LVigente > L_grupo`, prorrateo redondeado abajo) y detección de
 * cross-default (cierre de una empresa con `D1 ≥ D1CrossDefault`).
 *
 * Una *caída* es un cierre **nuevo y propio**, y por eso se descartan dos casos que si no
 * realimentan el contagio hasta el bloqueo mutuo:
 *
 * - Cierre cuya **única** puerta fallida es `grupo`: es el contagio que ya provocó otra empresa,
 *   no una caída nueva. Sin esta regla A tumba a B y el cierre de B vuelve a marcar a A.
 * - Empresa que llegaba al mes **ya cerrada** (`yaCerrada`): su cierre es el mismo evento del mes
 *   anterior. Sin esta regla la causa se redetecta cada mes y la bandera nunca deja de rearmarse.
 *
 * Puro: devuelve en `afectadas` las hermanas que sobreviven a una caída para que el motor (§9,
 * paso 2) recompute su límite con `escalonesExtra = 1` y vuelva a aplicar el techo. Aquí no se
 * baja ninguna banda.
 */
export function ajusteGrupo(
  rows: ScoreRow[],
  decisiones: DecisionMes[],
  LGrupo: number,
): AjusteGrupo {
  const suma = decisiones.reduce((a, d) => a + d.LVigente, 0);
  let motivoGrupo: string | null = null;
  let ajustadas = decisiones;
  if (suma > LGrupo) {
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
  return { decisiones: ajustadas, caidas, afectadas, motivoGrupo };
}
