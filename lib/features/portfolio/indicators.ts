/**
 * Catálogo de indicadores del score, tal y como los define docs/product/SOURCE.md §1.
 *
 * Cada variable lleva su lectura en lenguaje llano además de su id técnico: la
 * ficha enseña siempre la frase primero y el id (`A1`) como apoyo, nunca al
 * revés. Los umbrales sanos solo existen donde SOURCE los fija (bloque A, §1.2);
 * en B y C la comparación honesta es contra la mediana de la cartera, no contra
 * un número inventado.
 */

export const BLOCKS = {
  A: { id: "A", label: "Capacidad de deuda", weight: 0.45 },
  B: { id: "B", label: "Fiabilidad", weight: 0.3 },
  C: { id: "C", label: "Dependencia", weight: 0.25 },
} as const;

export type BlockId = keyof typeof BLOCKS;

export type IndicatorFormat = "percent" | "ratio" | "days" | "months";

export type Indicator = {
  id: string;
  block: BlockId;
  /** Nombre en lenguaje llano. Es lo que lee el analista. */
  label: string;
  /** La pregunta de negocio que responde, de SOURCE §1. */
  question: string;
  /** "alto" = más es mejor. Determina el sentido de la escala 0-100. */
  betterWhen: "alto" | "bajo";
  format: IndicatorFormat;
  /** Umbral sano de SOURCE §1.2. Solo el bloque A lo tiene fijado. */
  healthy?: number;
  /** Empresas sin este dato no puntúan la variable; baja su confianza. */
  requires?: "deuda" | "facturas" | "linea";
};

export const INDICATORS: Indicator[] = [
  {
    id: "A1",
    block: "A",
    label: "Margen de caja",
    question: "¿Queda caja tras pagar la operación?",
    betterWhen: "alto",
    format: "percent",
    healthy: 0.1,
  },
  {
    id: "A2",
    block: "A",
    label: "Meses en déficit",
    question: "¿Es habitual gastar más de lo que cobra?",
    betterWhen: "bajo",
    format: "percent",
    healthy: 1 / 6,
  },
  {
    id: "A3",
    block: "A",
    label: "Cobertura de deuda",
    question: "¿La caja cubre las cuotas?",
    betterWhen: "alto",
    format: "ratio",
    healthy: 1.3,
    requires: "deuda",
  },
  {
    id: "A4",
    block: "A",
    label: "Carga de deuda existente",
    question: "¿Cuánto de lo cobrado ya está comprometido?",
    betterWhen: "bajo",
    format: "percent",
    healthy: 0.25,
    requires: "deuda",
  },
  {
    id: "A5",
    block: "A",
    label: "Dependencia de crédito",
    question: "¿Vive de tirar de la línea?",
    betterWhen: "bajo",
    format: "percent",
    healthy: 0.2,
    requires: "linea",
  },
  {
    id: "B1",
    block: "B",
    label: "Cumplimiento acumulado",
    question: "¿Paga lo que debe, aunque sea tarde?",
    betterWhen: "alto",
    format: "percent",
  },
  {
    id: "B2",
    block: "B",
    label: "Racha de retraso",
    question: "¿Cuántos meses seguidos lleva sin pagar una obligación esperada?",
    betterWhen: "bajo",
    format: "months",
  },
  {
    id: "B3",
    block: "B",
    label: "Puntualidad con proveedores",
    question: "¿Paga sus facturas a tiempo?",
    betterWhen: "bajo",
    format: "days",
    requires: "facturas",
  },
  {
    id: "C1",
    block: "C",
    label: "Concentración de clientes",
    question: "¿Los cobros salen de pocos clientes?",
    betterWhen: "bajo",
    format: "percent",
  },
  {
    id: "C2",
    block: "C",
    label: "Concentración de proveedores",
    question: "¿Depende de pocos proveedores?",
    betterWhen: "bajo",
    format: "percent",
  },
  {
    id: "C3",
    block: "C",
    label: "Retraso de cobro",
    question: "¿Sus clientes pagan tarde?",
    betterWhen: "bajo",
    format: "days",
    requires: "facturas",
  },
  {
    id: "C4",
    block: "C",
    label: "Vencido sin cobrar",
    question: "¿Acumula facturas vencidas?",
    betterWhen: "bajo",
    format: "percent",
    requires: "facturas",
  },
  {
    id: "C5",
    block: "C",
    label: "Volatilidad de cobros",
    question: "¿Es predecible lo que entra cada mes?",
    betterWhen: "bajo",
    format: "ratio",
  },
  {
    id: "C6",
    block: "C",
    label: "Recibos devueltos",
    question: "¿Sus clientes le devuelven recibos?",
    betterWhen: "bajo",
    format: "percent",
  },
];

const BY_ID = new Map(INDICATORS.map((indicator) => [indicator.id, indicator]));

export function indicator(id: string): Indicator | undefined {
  return BY_ID.get(id);
}

export function indicatorsOf(block: BlockId): Indicator[] {
  return INDICATORS.filter((item) => item.block === block);
}
