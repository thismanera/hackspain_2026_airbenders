import type { Banda } from "@/lib/features/decision/params";
import type { Horizonte } from "@/lib/features/forecast/params";
import type { VariableId } from "@/lib/features/scoring/params";
import type { Contribution, Direccion, ScoreRow } from "@/lib/features/scoring/types";

/** Flujo mensual mínimo que necesita la previsión (scoring §4.1): `Prepared.history` lo cumple. */
export type MonthlyFlow = { observed: boolean; cobrosOp: number; pagosOp: number };

export type ForecastGroupInput = {
  groupId: string;
  /** Todas las filas `company_month_score` del grupo (todas las empresas, todos los meses). */
  rows: ScoreRow[];
  /** Por empresa, indexado por `CALENDAR` (`undefined` donde no hay movimientos). */
  flows: Map<string, (MonthlyFlow | undefined)[]>;
};

export type Driver = {
  id: Contribution["id"];
  valorActual: number | null;
  valorPred: number | null;
  deltaAportacion: number;
};

export type HorizonForecast = {
  scorePred: number;
  bandaPred: Banda;
  p10: number;
  p90: number;
  /** A1..C6 más la fila `grupo`, como `ScoreRow.variables` (§3.3). */
  cascadaPred: Contribution[];
  drivers: Driver[];
  rachaDeficitPred: number;
  rachaB2Pred: number;
};

export type Metodo = "v1_proyeccion" | "v2_modelo" | "desconectado";

/** Contrato forecast-engine §8, una fila por empresa × mes. */
export type ForecastRow = {
  company: string;
  month: string;
  groupId: string;
  versionParametros: string;
  horizontes: Record<Horizonte, HorizonForecast>;
  direccionPred: Direccion;
  probDeterioro6m: number | null;
  sinTendencia: VariableId[];
  metodo: Metodo;
};
