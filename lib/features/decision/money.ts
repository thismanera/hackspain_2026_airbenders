/**
 * Redondeo al escalón del grid de importes (`P.redondeoL`), compartido por §4 (límite), §7 (menú)
 * y §9 (techo de grupo).
 *
 * Antes de bajar al escalón se redondea a céntimos: los importes vienen de divisiones en coma
 * flotante (prorrateo del grupo, recortes por confianza) y un 48 000 representado como
 * 47 999,999999 caería un escalón entero de 1 000 € sin esta normalización.
 */
function aCentimos(x: number): number {
  return Math.round(x * 100) / 100;
}

export function redondearAbajo(x: number, paso: number): number {
  return Math.floor(aCentimos(x) / paso) * paso;
}

export function redondearArriba(x: number, paso: number): number {
  return Math.ceil(aCentimos(x) / paso) * paso;
}
