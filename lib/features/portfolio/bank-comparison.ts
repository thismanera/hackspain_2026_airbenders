/**
 * Comparativa de coste anual entre la línea Embat del mes y una póliza bancaria
 * "tipo". Los términos bancarios son SUPUESTOS de mercado para la demo, no datos
 * del dataset: el panel los enseña siempre etiquetados como tal. No se inventa
 * nada cuando no hay línea: sin decisión elegible con límite no hay comparativa.
 */
import type { Decision } from "./types";

/** Supuestos de la póliza bancaria de referencia (puntos porcentuales / fracción). */
export const BANK_ASSUMPTIONS = {
  /** TAE de referencia para pólizas de circulante pyme, en puntos porcentuales. */
  aprPoints: 8.2,
  /** Comisión de apertura y estudio sobre el límite, fracción anual. */
  openingFee: 0.006,
  /** Comisión trimestral de no disponibilidad, en puntos porcentuales (solo texto). */
  nonUsagePoints: 0.25,
  label: "supuesto de mercado, editable",
} as const;

export type BankComparison = {
  /** Límite vigente sobre el que se compara, en euros. */
  volume: number;
  /** TAE Embat del primer plazo del menú, en puntos. */
  embatApr: number;
  bankApr: number;
  /** Diferencia de TAE (banco − Embat), en puntos; negativa si Embat es más cara. */
  aprGap: number;
  bankInterest: number;
  embatInterest: number;
  openingFee: number;
  bankTotal: number;
  embatTotal: number;
  /** Ahorro anual (banco − Embat); negativo si Embat sale más cara. */
  savings: number;
};

/** `null` cuando no hay línea vigente: sin importe ni TAE reales no hay comparación posible. */
export function bankComparison(decision: Decision): BankComparison | null {
  if (!decision.eligible || decision.limit <= 0 || decision.apr <= 0) return null;
  const volume = decision.limit;
  const bankInterest = Math.round((volume * BANK_ASSUMPTIONS.aprPoints) / 100);
  const embatInterest = Math.round((volume * decision.apr) / 100);
  const openingFee = Math.round(volume * BANK_ASSUMPTIONS.openingFee);
  const bankTotal = bankInterest + openingFee;
  return {
    volume,
    embatApr: decision.apr,
    bankApr: BANK_ASSUMPTIONS.aprPoints,
    aprGap: Math.round((BANK_ASSUMPTIONS.aprPoints - decision.apr) * 100) / 100,
    bankInterest,
    embatInterest,
    openingFee,
    bankTotal,
    embatTotal: embatInterest,
    savings: bankTotal - embatInterest,
  };
}
