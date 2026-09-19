import type { Banda } from "@/lib/features/decision/params";
import type { Horizonte } from "@/lib/features/forecast/params";
import type { VariableId } from "@/lib/features/scoring/params";
import type { Contribution, Direccion, ScoreRow } from "@/lib/features/scoring/types";

export type MonthlyFlow = {
  observed: boolean;
  cobrosOp: number;
  pagosOp: number;
  servicioDeuda?: number;
  dispCredito?: number;
  amortCredito?: number;
};

export type ForecastGroupInput = {
  groupId: string;
  rows: ScoreRow[];
  flows: Map<string, (MonthlyFlow | undefined)[]>;
};

export type ForecastContribution = Omit<Contribution, "id"> & { id: VariableId | "holding" };

export type Driver = {
  id: VariableId | "holding";
  valorActual: number | null;
  valorPred: number | null;
  deltaAportacion: number;
};

export type Hermana = { row: ScoreRow; scoreSoloPred: number };

export type HorizonForecast = {
  scoreSoloPred: number;
  bandaSoloPred: Banda;
  p10Solo: number;
  p90Solo: number;
  scoreGrupoPred: number;
  bandaGrupoPred: Banda;
  p10Grupo: number;
  p90Grupo: number;
  ajusteHoldingPred: number;
  cascadaPred: ForecastContribution[];
  driversSolo: Driver[];
  driversGrupo: Driver[];
  rachaDeficitPred: number;
  rachaB2Pred: number;
  scorePred: number;
  bandaPred: Banda;
  p10: number;
  p90: number;
  drivers: Driver[];
};

export type Metodo = "v1_proyeccion" | "v2_modelo" | "desconectado";

export type ForecastRow = {
  company: string;
  month: string;
  groupId: string;
  versionParametros: string;
  horizontes: Record<Horizonte, HorizonForecast>;
  direccionSoloPred: Direccion;
  direccionGrupoPred: Direccion;
  probDeterioroSolo6m: number | null;
  probDeterioroGrupo6m: number | null;
  sinTendencia: VariableId[];
  metodoSolo: Metodo;
  metodoGrupo: Metodo;
  direccionPred: Direccion;
  probDeterioro6m: number | null;
  metodo: Metodo;
};
