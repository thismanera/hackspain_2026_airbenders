import { type Clip, FORECAST_PARAMS as P } from "@/lib/features/forecast/params";
import { acumulada, proyectar, tendencia } from "@/lib/features/forecast/trend";
import type { MonthlyFlow } from "@/lib/features/forecast/types";
import { VARIABLES, type VariableId } from "@/lib/features/scoring/params";
import type { ScoreRow, VariableSet, VariableValue } from "@/lib/features/scoring/types";

export type CompanyCtx = {
  /** Filas de la empresa indexadas por `CALENDAR` (`undefined` = sin fila ese mes). */
  rows: readonly (ScoreRow | undefined)[];
  flows: readonly (MonthlyFlow | undefined)[];
  t: number;
};

export type Proyeccion = {
  vars: VariableSet;
  /** `[racha(t+h−1), racha(t+h−2), racha(t+h−3)]` para `subnotaB2` (decisión 7). */
  rachaB2Prev: number[];
  rachaB2Pred: number;
  rachaDeficitPred: number;
  sinTendencia: VariableId[];
};

/** Variables que siguen la tendencia general (§3.1); el resto tiene regla propia (§3.2). */
export const CON_TENDENCIA: readonly VariableId[] = VARIABLES.filter(
  (id) => !P.sinTendenciaGeneral.includes(id),
);

function rawAt(ctx: CompanyCtx, m: number, id: VariableId): number | null {
  return ctx.rows[m]?.variables.find((c) => c.id === id)?.raw ?? null;
}

function serie(ctx: CompanyCtx, pick: (m: number) => number | null): (number | null)[] {
  const out: (number | null)[] = [];
  for (let m = ctx.t - P.ventanaTendencia + 1; m <= ctx.t; m++) out.push(m >= 0 ? pick(m) : null);
  return out;
}

/** Caja operativa proyectada a `t + i` (decisión 5 del plan: amortiguación también en flujos). */
export type CajaPred = { disponible: boolean; caja: (i: number) => number };

export function cajaProyectada(ctx: CompanyCtx): CajaPred {
  const f = ctx.flows[ctx.t];
  if (!f?.observed) return { disponible: false, caja: () => 0 };
  const cobros = tendencia(
    serie(ctx, (m) => (ctx.flows[m]?.observed ? ctx.flows[m]!.cobrosOp : null)),
  );
  const pagos = tendencia(serie(ctx, (m) => (ctx.flows[m]?.observed ? ctx.flows[m]!.pagosOp : null)));
  return {
    disponible: true,
    caja: (i) =>
      f.cobrosOp + cobros.tendencia * acumulada(i) - (f.pagosOp + pagos.tendencia * acumulada(i)),
  };
}

/** A2 a `t+h`: déficits en la ventana de 6 meses que termina en `t+h`, reales observados + proyectados. */
function a2Pred(ctx: CompanyCtx, h: number, caja: CajaPred): number | null {
  let deficits = 0;
  let n = 0;
  for (let m = ctx.t + h - (P.ventanaTendencia - 1); m <= ctx.t + h; m++) {
    if (m > ctx.t) {
      n++;
      if (caja.caja(m - ctx.t) < 0) deficits++;
    } else if (m >= 0 && ctx.flows[m]?.observed) {
      n++;
      if (ctx.flows[m]!.cobrosOp < ctx.flows[m]!.pagosOp) deficits++;
    }
  }
  return n ? deficits / n : null;
}

/** Racha de déficit a `t+h`: meses proyectados seguidos en negativo, encadenados con la real si cubren todo `h`. */
function rachaDeficitPred(row: ScoreRow, h: number, caja: CajaPred): number {
  let r = 0;
  for (let i = h; i >= 1 && caja.caja(i) < 0; i--) r++;
  return r === h ? r + row.rachaDeficit : r;
}

/** §3.2: proyección de las 14 variables de una empresa a `t + h` con sus excepciones. */
export function proyectarEmpresa(ctx: CompanyCtx, h: number, clip: Clip): Proyeccion {
  const row = ctx.rows[ctx.t];
  if (!row) throw new Error(`proyectarEmpresa: sin fila en t=${ctx.t}`);
  const actual = new Map(row.variables.map((c) => [c.id, c]));
  const vars = {} as VariableSet;
  const sinTendencia: VariableId[] = [];
  for (const id of CON_TENDENCIA) {
    const c = actual.get(id)!;
    const { tendencia: tend, sinTendencia: sin } = tendencia(serie(ctx, (m) => rawAt(ctx, m, id)));
    if (sin) sinTendencia.push(id);
    // NA en t sigue NA (subnota 50); conf constante: no se inventa confianza futura.
    vars[id] =
      c.raw === null
        ? { raw: null, conf: c.conf }
        : { raw: proyectar(c.raw, tend, h, clip[id]), conf: c.conf };
  }
  const c5 = actual.get("C5")!;
  vars.C5 = { raw: c5.raw, conf: c5.conf };

  const caja = cajaProyectada(ctx);
  const a2 = actual.get("A2")!;
  vars.A2 = caja.disponible
    ? { raw: a2Pred(ctx, h, caja) ?? a2.raw, conf: a2.conf }
    : { raw: a2.raw, conf: a2.conf };
  const rachaDeficit = caja.disponible ? rachaDeficitPred(row, h, caja) : row.rachaDeficit;

  const b2 = actual.get("B2")!;
  const b1 = vars.B1.raw;
  const rachaB2Pred = row.rachaB2 + (b1 !== null && b1 < P.b1UmbralRacha ? 1 : 0);
  vars.B2 =
    b2.raw === null
      ? { raw: null, conf: b2.conf }
      : ({ raw: rachaB2Pred, conf: b2.conf } satisfies VariableValue);
  // Meses proyectados (> t) llevan la racha prevista; los reales, la de su fila.
  const rachaB2Prev = [1, 2, 3].map((k) =>
    h - k >= 1 ? rachaB2Pred : (ctx.rows[ctx.t + h - k]?.rachaB2 ?? 0),
  );

  return { vars, rachaB2Prev, rachaB2Pred, rachaDeficitPred: rachaDeficit, sinTendencia };
}
