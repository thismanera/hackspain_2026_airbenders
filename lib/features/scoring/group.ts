import { PARAMS } from "@/lib/features/scoring/params";
import type { PerfilGrupo, ScoreRow } from "@/lib/features/scoring/types";
import { clamp, divide, sum } from "@/lib/features/scoring/windows";

export type GroupMember = {
  company: string;
  scoreSolo: number;
  confianza: number;
  cobrosOp12m: number;
  pagosOp12m: number;
  capacidadCuotaAdv: number;
  obligacionesMedia6m: number; // servicio_deuda + obligaciones_rec, media 6 m
  cobrosOpMedia6m?: number;
  pagosOpMedia6m?: number;
  servicioDeudaMedia6m?: number;
  capacidadNeta6m?: number;
  intragrupoIn12m: number;
  intragrupoOut12m: number;
  A1?: number | null;
  margenMes?: number | null;
  rachaB2?: number;
  b2Observed?: boolean;
};

export type GroupVars = Pick<ScoreRow, "D1" | "D2" | "D3" | "D4" | "D5" | "confD">;

/**
 * Segunda pasada del pipeline (§14): las hermanas ya deben traer su `scoreSolo` y su `confianza`
 * del mes `t` calculados en la primera pasada (solo con variables A/B/C, sin aval de grupo), o D2 y
 * confD saldrían de valores a medio construir. Sin hermanas conocidas: D2/D3 NA, D5 = 0 y
 * `confD = 0` (no hay información de grupo que ponderar), por lo que `ajusteHolding` será 0.
 */
export function groupVariables(me: GroupMember, siblings: GroupMember[]): GroupVars {
  const cobrosGrupo = me.cobrosOp12m + sum(siblings.map((s) => s.cobrosOp12m));
  const D1 = cobrosGrupo > 0 ? me.cobrosOp12m / cobrosGrupo : siblings.length ? 0 : 1;
  const D4 = divide(me.intragrupoIn12m - me.intragrupoOut12m, me.cobrosOp12m);
  if (!siblings.length) return { D1, D2: null, D3: null, D4, D5: 0, confD: 0 };
  const D5 = divide(me.intragrupoIn12m + me.intragrupoOut12m, me.cobrosOp12m + me.pagosOp12m) ?? 0;
  const peso = sum(siblings.map((s) => s.cobrosOp12m));
  // Sin cobros en las hermanas no hay peso que repartir: media simple, misma regla en D2 y confD.
  const media = (pick: (s: GroupMember) => number) =>
    peso > 0
      ? sum(siblings.map((s) => pick(s) * s.cobrosOp12m)) / peso
      : sum(siblings.map(pick)) / siblings.length;
  const D2 = media((s) => s.scoreSolo);
  const capacidad = sum(siblings.map((s) => s.capacidadCuotaAdv));
  const D3 =
    me.obligacionesMedia6m > 0 ? capacidad / me.obligacionesMedia6m : capacidad > 0 ? 2 : 0;
  return { D1, D2, D3, D4, D5, confD: media((s) => s.confianza) };
}

export type HoldingTotals = { excedente: number; deficit: number };

function capacidadNeta(member: GroupMember): number {
  return (
    member.capacidadNeta6m ??
    (member.cobrosOpMedia6m ?? 0) -
      (member.pagosOpMedia6m ?? 0) -
      (member.servicioDeudaMedia6m ?? 0)
  );
}

export function holdingTotals(members: GroupMember[]): HoldingTotals {
  return members.reduce(
    (out, member) => {
      if (member.confianza < PARAMS.confSinDatos) return out;
      const ci = capacidadNeta(member);
      if (ci > 0) out.excedente += ci;
      else if (ci < 0) out.deficit += -ci;
      return out;
    },
    { excedente: 0, deficit: 0 },
  );
}

export function ajusteHolding(
  me: GroupMember,
  siblings: GroupMember[],
  D2: number | null,
  D5: number,
): number {
  if (D2 === null || siblings.length === 0) return 0;
  const all = [me, ...siblings];
  const { excedente: S, deficit: D } = holdingTotals(all);
  const factorD5 = clamp(D5 / PARAMS.holding.saturacionD5, 0, 1);
  if (factorD5 === 0 || S <= 0 || D <= 0) return 0;
  if (capacidadNeta(me) > 0 && me.scoreSolo > D2) {
    return -Math.min(
      PARAMS.holding.drenajeMax,
      Math.min(1, D / S) * (me.scoreSolo - D2) * PARAMS.holding.factorAtenuacionDrenaje * factorD5,
    );
  }
  if (capacidadNeta(me) < 0 && me.scoreSolo < D2) {
    return Math.min(
      PARAMS.holding.respaldoMax,
      Math.min(1, S / D) * (D2 - me.scoreSolo) * PARAMS.holding.factorAtenuacionRespaldo * factorD5,
    );
  }
  return 0;
}

export function perfilGrupo(
  capacidadNeta6m: number,
  A1: number | null | undefined,
  margenMedio6m: number | null | undefined,
  D2: number | null,
  D4: number | null,
  rachaB2 = 0,
  b2Observed = true,
): PerfilGrupo {
  if ((margenMedio6m != null && margenMedio6m < 0) || (A1 != null && A1 < 0)) {
    if (D4 !== null && D4 > 0.3 && b2Observed && rachaB2 === 0 && D2 !== null && D2 >= 60)
      return "filial_subvencionada";
  }
  if (capacidadNeta6m > 0 && D4 !== null && D4 < -0.4) return "drenaje_tesoreria";
  return "estandar";
}
