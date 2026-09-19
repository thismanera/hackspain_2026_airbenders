import { coste, tae } from "@/lib/features/decision/interest";
import { redondearAbajo } from "@/lib/features/decision/money";
import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { DecisionInput, MenuOption } from "@/lib/features/decision/types";

/**
 * decision-engine §7 con la decisión 46: el menú es una **rampa** sobre el propio límite,
 * `cantidad_max(plazo) = redondear_abajo(L × min(1, plazo / rampa_dias), redondeo_L)`.
 *
 * La región factible ya no se mide con una capacidad de cuota en euros (decisión 45: no existe en
 * el contrato). La rampa conserva lo que la dependencia cantidad-plazo quería decir —plazo corto,
 * cantidad pequeña; plazo largo, cantidad cerca de `L` y más cara— con un solo número explicable,
 * y llega a `L` exactamente en `rampa_dias` (180 d), que es el plazo máximo del producto.
 */
export function menu(
  r: DecisionInput,
  L: number,
  TMax: number,
  bEfectiva: Banda,
  bandaPred: Banda,
): MenuOption[] {
  const out: MenuOption[] = [];
  for (const plazo of P.plazosMenu) {
    if (plazo > TMax) break;
    const cantidadMax = redondearAbajo(L * Math.min(1, plazo / P.rampaDias), P.redondeoL);
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

/**
 * Plazo natural del anticipo (§6). Decisión 43: `C3_dias` sale del contrato de entrada, así que
 * el anticipo usa el plazo por defecto (60 d) para todas las empresas. Era una sugerencia de la
 * ficha —qué fila del menú resaltar—, nunca una restricción: el menú entero sigue disponible.
 */
export function plazoNatural(): number {
  return (
    P.plazosMenu.find((p) => p >= P.plazoNaturalDefecto) ?? P.plazosMenu[P.plazosMenu.length - 1]
  );
}
