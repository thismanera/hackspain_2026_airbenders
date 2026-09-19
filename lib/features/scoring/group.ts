import { PARAMS } from "@/lib/features/scoring/params";
import type { ScoreRow } from "@/lib/features/scoring/types";
import { clamp, divide, sum } from "@/lib/features/scoring/windows";

export type GroupMember = {
  company: string;
  scoreSolo: number;
  confianza: number;
  cobrosOp12m: number;
  pagosOp12m: number;
  capacidadCuotaAdv: number;
  obligacionesMedia6m: number; // servicio_deuda + obligaciones_rec, media 6 m
  intragrupoIn12m: number;
  intragrupoOut12m: number;
};

export type GroupVars = Pick<ScoreRow, "D1" | "D2" | "D3" | "D4" | "D5" | "confD">;

/**
 * Segunda pasada del pipeline (§14): las hermanas ya deben traer su `scoreSolo` y su `confianza`
 * del mes `t` calculados en la primera pasada (solo con variables A/B/C, sin aval de grupo), o D2 y
 * confD saldrían de valores a medio construir. Sin hermanas conocidas: D2/D3 NA, D5 = 0 y
 * `confD = 0` (no hay información de grupo que ponderar), por lo que `aval_grupo` será 0.
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
    me.obligacionesMedia6m > 0
      ? capacidad / me.obligacionesMedia6m
      : capacidad > 0
        ? PARAMS.d3Ref
        : 0;
  return { D1, D2, D3, D4, D5, confD: media((s) => s.confianza) };
}

export function avalGrupo(scoreSolo: number, D2: number | null, D3: number | null, D5: number): number {
  if (D2 === null) return 0;
  const w = PARAMS.wMax * Math.min(1, D5 / PARAMS.d5Saturacion);
  const a = D2 > scoreSolo ? w * Math.min(1, (D3 ?? 0) / PARAMS.d3Ref) * (D2 - scoreSolo) : w * (D2 - scoreSolo);
  return clamp(a, -PARAMS.avalMax, PARAMS.avalMax);
}
