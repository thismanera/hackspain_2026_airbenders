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

/**
 * Escalas con anclajes económicos. Los ratios de caja y de uso de crédito no
 * tienen una distribución estable: un denominador pequeño puede producir
 * valores enormes y hacer que un p5/p95 parezca saludable. Cada par es
 * [valor bruto, subnota] y se interpola linealmente fuera de los extremos.
 */
type Anchor = readonly [raw: number, nota: number];
type AnchoredScales = Partial<Record<VariableId, readonly Anchor[]>>;

export const PARAMS = {
  contratoVersion: "scoreSolo-holding-v7",
  mesInicio: "2024-09",
  mesFin: "2026-08",
  ventanaCorta: 6,
  ventanaLarga: 12,
  pesos: { A: 0.45, B: 0.3, C: 0.25 } as Readonly<Record<Bloque, number>>,
  pesosVariables: {
    A1: 0.1,
    A2: 0.1,
    A3: 0.1,
    A4: 0.08,
    A5: 0.07,
    B1: 0.12,
    B2: 0.12,
    B3: 0.06,
    C1: 0.015,
    C2: 0.015,
    C3: 0.04,
    C4: 0.08,
    C5: 0.03,
    C6: 0.07,
  } as Readonly<Record<VariableId, number>>,
  pesosVariablesSinDeuda: {
    A1: 0.25,
    A2: 0.2,
  } as const,
  pesosVariablesCuotasSinLinea: {
    A1: 0.12,
    A2: 0.12,
    A3: 0.11,
    A4: 0.1,
    A5: 0,
  } as const,
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
  escalasAncladas: {
    A1: [
      [-0.2, 0],
      [0, 50],
      [0.1, 70],
      [0.3, 90],
      [0.5, 100],
    ],
    A3: [
      [0, 0],
      [1, 50],
      [1.3, 70],
      [2, 90],
      [3, 100],
    ],
    A4: [
      [0, 100],
      [0.25, 70],
      [0.5, 50],
      [1, 0],
    ],
    A5: [
      [0, 100],
      [0.2, 70],
      [0.5, 50],
      [1, 0],
    ],
    B1: [
      [0, 0],
      [0.8, 50],
      [0.95, 80],
      [1, 100],
    ],
    C4: [
      [0, 100],
      [0.2, 70],
      [0.4, 30],
      [0.6, 0],
    ],
    C6: [
      [0, 100],
      [0.005, 70],
      [0.01, 40],
      [0.02, 0],
    ],
  } as AnchoredScales,
  nFacturasRef: 5,
  confSinDatos: 0.3,
  confSana: 0.5,
  scoreSana: 70,
  scoreRiesgo: 45,
  recurrenciaMin: 3,
  subnotaRacha1: 70,
  decaimientoMeses: 3,
  umbralDireccion: 6,
  caidaAcumulada3mAlerta: 8,
  persistenciaEstructural: 2,
  minVariablesEstructural: 2,
  deltaAportacionMin: 1,
  holding: {
    drenajeMax: 30,
    respaldoMax: 20,
    saturacionD5: 0.15,
    factorMinimoGrupo: 0.35,
    factorAtenuacionDrenaje: 0.8,
    factorAtenuacionRespaldo: 0.7,
  },
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
  volatilidadPercentil: 0.8,
  hardcoreRevolving: {
    minMesesObservados: 3,
    penalizacionA5: 20,
  },
  ewi: {
    minIndicadoresRevision: 2,
    a3CoberturaMin: 1.3,
    c4Morosidad: 0.25,
    revisionPlazoDias: 60,
  },
  gapCicloDiasEmbat: 30,
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
