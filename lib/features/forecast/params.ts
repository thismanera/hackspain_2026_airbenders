import type { Banda } from "@/lib/features/decision/params";
import { hashParams, PARAMS, type VariableId } from "@/lib/features/scoring/params";

export const HORIZONTES = [3, 6] as const;
export type Horizonte = (typeof HORIZONTES)[number];

/** docs/forecast-engine.md §2. Ningún número suelto en código. */
export const FORECAST_PARAMS = {
  horizontes: HORIZONTES,
  ventanaTendencia: 6,
  minMesesTendencia: 4,
  /** `amortiguacion[i − 1]` multiplica la tendencia del mes `t + i` (§3.2). */
  amortiguacion: [1, 1, 1, 0.5, 0.5, 0.5] as readonly number[],
  clipPercentiles: { bajo: 0.01, alto: 0.99 },
  residuosPercentiles: { bajo: 0.1, alto: 0.9 },
  /** Mismo umbral que scoring §8 (decisión 10). */
  umbralDireccion: PARAMS.umbralDireccion,
  /** B2 proyectada sube un mes si `B1` proyectado cae por debajo (§3.2). */
  b1UmbralRacha: 0.9,
  /** Celda de `P_det` con menos observaciones hereda la fila (§5). */
  minObsCelda: 30,
  /** El evento de deterioro cuenta si cae en `(t, t + ventanaEvento]` (§5). */
  ventanaEvento: 6,
  nDrivers: 3,
  /** Variables cuya proyección no es la tendencia general (§3.2). */
  sinTendenciaGeneral: ["A2", "B2", "C5"] as readonly VariableId[],
} as const;
export type ForecastParams = typeof FORECAST_PARAMS;

export type ClipVar = { p1: number | null; p99: number | null };
export type Clip = Record<VariableId, ClipVar>;
export type Residuos = Record<Horizonte, Record<Banda, { p10: number; p90: number }>>;
export type PDet = Record<Banda, Record<Banda, number | null>>;

/** Parámetros ajustados (§2, §4, §5), versionados por hash igual que scoring. */
export type ForecastParameters = {
  version: string;
  paramsHash: string;
  versionScoring: string;
  clip: Clip;
  residuos: Residuos;
  pDet: PDet;
  /** `false` si en ajuste v1 no bate al baseline ingenuo en MAE a 3 meses (§9): `metodo = "desconectado"`. */
  conectado: boolean;
  ajuste: { filas3m: number; mae3m: number | null; mae3mBaseline: number | null };
};

export function hashForecastParams(p: Record<string, unknown>): string {
  return hashParams(p);
}
