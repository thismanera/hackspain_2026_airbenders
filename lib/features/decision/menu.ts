import { coste, tae } from "@/lib/features/decision/interest";
import { redondearAbajo } from "@/lib/features/decision/money";
import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { MenuOption } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";

/** decision-engine §7: región factible `cantidad ≤ L` y `cantidad ≤ capacidad × plazo_meses`. */
export function menu(
  r: ScoreRow,
  L: number,
  TMax: number,
  bEfectiva: Banda,
  bandaPred: Banda,
): MenuOption[] {
  const out: MenuOption[] = [];
  for (const plazo of P.plazosMenu) {
    if (plazo > TMax) break;
    const cantidadMax = redondearAbajo(
      Math.min(L, r.capacidadCuotaAdv * (plazo / 30)),
      P.redondeoL,
    );
    if (cantidadMax <= 0) continue;
    const t = tae(bEfectiva, plazo, r, bandaPred);
    if (t.tae === null) continue;
    out.push({
      plazo,
      cantidadMax,
      tae: t.tae,
      costeMax: coste(cantidadMax, t.tae, plazo),
      desglose: t.desglose,
    });
  }
  return out;
}

export function valida(
  peticion: { cantidad: number; plazo: number },
  opciones: MenuOption[],
): boolean {
  const op = opciones.find((o) => o.plazo >= peticion.plazo);
  return !!op && peticion.cantidad <= op.cantidadMax;
}

/** Plazo natural del anticipo: C3 redondeado arriba al plazo del menú; sin dato → 60 d (§6). */
export function plazoNatural(r: ScoreRow): number {
  const dias = r.C3dias ?? P.plazoNaturalDefecto;
  return P.plazosMenu.find((p) => p >= dias) ?? P.plazosMenu[P.plazosMenu.length - 1];
}
