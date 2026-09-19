import { createHash } from "node:crypto";

export const VARIABLES = [
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "B1",
  "B2",
  "B3",
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
] as const;
export type VariableId = (typeof VARIABLES)[number];
export type Bloque = "A" | "B" | "C";

export const PARAMS = {
  mesInicio: "2024-09",
  mesFin: "2026-08",
  ventanaCorta: 6,
  ventanaLarga: 12,
  pesos: { A: 0.45, B: 0.3, C: 0.25 } as Readonly<Record<Bloque, number>>,
  bloques: {
    A: ["A1", "A2", "A3", "A4", "A5"],
    B: ["B1", "B2", "B3"],
    C: ["C1", "C2", "C3", "C4", "C5", "C6"],
  } as Readonly<Record<Bloque, readonly VariableId[]>>,
  mejor: {
    A1: "alto",
    A2: "bajo",
    A3: "alto",
    A4: "bajo",
    A5: "bajo",
    B1: "alto",
    B2: "bajo",
    B3: "bajo",
    C1: "bajo",
    C2: "bajo",
    C3: "bajo",
    C4: "bajo",
    C5: "bajo",
    C6: "bajo",
  } as Readonly<Record<VariableId, "alto" | "bajo">>,
  umbralSano: {
    A1: 0.1,
    A2: 1 / 6,
    A3: 1.3,
    A4: 0.25,
    A5: 0.2,
  } as Readonly<Partial<Record<VariableId, number>>>,
  nFacturasRef: 5,
  confSinDatos: 0.3,
  confSana: 0.5,
  scoreSana: 70,
  scoreRiesgo: 45,
  recurrenciaMin: 3,
  subnotaRacha1: 70,
  decaimientoMeses: 3,
  umbralDireccion: 6,
  persistenciaEstructural: 2,
  minVariablesEstructural: 2,
  deltaAportacionMin: 1,
  wMax: 0.4,
  d5Saturacion: 0.2,
  avalMax: 20,
  d3Ref: 2,
  estresCobros: 0.8,
  estresPagos: 1.1,
  coberturaMin: 1.3,
  categoryConfidenceMin: 0.95,
  // Excepción (decisión de diseño a revisitar, docs/SOURCE.md decisión 2): #12 asigna a estas dos
  // categorías de regla una confianza fija de 0,90 sin precisión estimada.
  categoryConfidenceNuevas: 0.9,
  categoriasNuevas: ["debt_drawdown", "balance_adjustment"],
  a5SinLineaConf: 0.3,
  minObsVolatilidad: 6,
  alertaContagio: -10,
  vencidoAlto: 0.4,
} as const;
export type Params = typeof PARAMS;

/** JSON canonico: claves de objeto ordenadas recursivamente para que el hash no dependa del orden. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  return value;
}

export function hashParams(p: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(p)))
    .digest("hex");
}
