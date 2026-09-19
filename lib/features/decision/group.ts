import { banda, factorA } from "@/lib/features/decision/limit";
import { redondearAbajo } from "@/lib/features/decision/money";
import { eur } from "@/lib/features/decision/motivos";
import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { Accion, DecisionInput, Puerta } from "@/lib/features/decision/types";

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
  tamano: number;
  limiteOp: number;
  score: number;
  confianza: number;
  factorA: number;
  banda: Banda;
  L: number;
};

/**
 * §9 con la decisión 47: el techo del grupo es la fórmula de §4 aplicada al grupo como si fuese
 * una sola empresa, con **Σ tamaño** de los miembros presentes ese mes y con score, confianza y
 * pilar A ponderados por ese mismo tamaño (media simple si Σ tamaño = 0).
 *
 * Ya no se leen los flujos consolidados de `ScoreRow` (decisión 43: salen del contrato). Eran,
 * además, la causa del techo cero de la decisión 41: las hermanas sin datos aportaban pagos
 * clasificados y pocos cobros, así que la caja consolidada estresada se iba a negativo por falta
 * de dato. Sumando tamaños esa asimetría desaparece —una hermana sin datos suma 0, no resta— y el
 * techo solo puede salir 0 si el grupo es banda D o si nadie del grupo cobra nada, dos casos en
 * los que el límite individual de cada miembro también es 0. Por eso la regla "techo cero → baja
 * banda" (decisión 41) queda sin objeto y se retira.
 *
 * Quien mueve el dinero del grupo es quien manda en la banda, en el recorte por confianza y en el
 * recorte por pilar A.
 */
export function limiteGrupo(rows: DecisionInput[]): LimiteGrupo {
  if (rows.length === 0) throw new Error("limiteGrupo: grupo vacío");
  const tamano = rows.reduce((a, r) => a + r.tamano, 0);
  const media = (f: (r: DecisionInput) => number): number =>
    tamano > 0
      ? rows.reduce((a, r) => a + f(r) * r.tamano, 0) / tamano
      : rows.reduce((a, r) => a + f(r), 0) / rows.length;
  const score = media((r) => r.score);
  const confianza = media((r) => r.confianza);
  const A = media((r) => r.subscores.A);
  const limiteOp = P.anticipoPct * tamano * P.anticipoMeses;
  const b = banda(score);
  const fA = factorA(A);
  const L = redondearAbajo(
    limiteOp * P.factorBanda[b] * Math.min(1, confianza / P.confRef) * fA,
    P.redondeoL,
  );
  return { tamano, limiteOp, score, confianza, factorA: fA, banda: b, L };
}

/** `"prorrateo"` cuando `Σ L_vigente` pasa del techo; `null`, sin techo mordiente. */
export type ModoTecho = "prorrateo" | null;

export type AjusteGrupo = {
  decisiones: DecisionMes[];
  /** Empresas caídas con cross-default, en orden alfabético (salida determinista). */
  caidas: string[];
  afectadas: string[];
  modo: ModoTecho;
  motivoGrupo: string | null;
};

/**
 * §9: techo del grupo (si `Σ LVigente > L_grupo`, prorrateo redondeado abajo) y detección de
 * cross-default (cierre de una empresa con `D1 ≥ D1CrossDefault`).
 *
 * Decisión 47: el prorrateo es la **única** regla de techo. La excepción de la decisión 41
 * (`L_grupo = 0` ⇒ bajar una banda en vez de prorratear a cero) desaparece con su causa: el techo
 * se mide sobre Σ tamaño, no sobre una caja consolidada estresada que se iba a negativo por falta
 * de dato. `L_grupo = 0` solo ocurre en banda D o con Σ tamaño = 0, y en los dos casos el límite
 * individual de cada miembro ya es 0.
 *
 * Una *caída* es un cierre **nuevo y propio**, y por eso se descartan dos casos que si no
 * realimentan el contagio hasta el bloqueo mutuo:
 *
 * - Cierre cuya **única** puerta fallida es `grupo`: es el contagio que ya provocó otra empresa,
 *   no una caída nueva. Sin esta regla A tumba a B y el cierre de B vuelve a marcar a A.
 * - Empresa que llegaba al mes **ya cerrada** (`yaCerrada`): su cierre es el mismo evento del mes
 *   anterior. Sin esta regla la causa se redetecta cada mes y la bandera nunca deja de rearmarse.
 *
 * Puro: devuelve en `afectadas` las hermanas que sobreviven a una caída, para que el motor (§9,
 * paso 2) recompute su límite con el escalón de banda y vuelva a aplicar el techo. Aquí no se
 * baja ninguna banda.
 */
export function ajusteGrupo(
  rows: DecisionInput[],
  decisiones: DecisionMes[],
  LGrupo: number,
): AjusteGrupo {
  const suma = decisiones.reduce((a, d) => a + d.LVigente, 0);
  let motivoGrupo: string | null = null;
  let ajustadas = decisiones;
  let modo: ModoTecho = null;
  if (suma > LGrupo) {
    modo = "prorrateo";
    ajustadas = decisiones.map((d) => ({
      ...d,
      LVigente: suma > 0 ? redondearAbajo((d.LVigente * LGrupo) / suma, P.redondeoL) : 0,
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
  return { decisiones: ajustadas, caidas, afectadas, modo, motivoGrupo };
}
