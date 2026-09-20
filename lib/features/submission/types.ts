import type { Accion } from "@/lib/features/decision/types";
import type { Direccion, Estado, PatronTrayectoria } from "@/lib/features/scoring/types";
import type { ProductoSugerido } from "@/lib/features/rca/types";

export type SubmissionRow = {
  company_id: string;
  month: string;
  group_id: string;
  score_solo: number;
  score_grupo: number;
  ajuste_holding: number;
  estado: Estado;
  direccion: Direccion;
  patron_trayectoria: PatronTrayectoria;
  alerta_temprana: boolean;
  canario_en_mina: boolean;
  inflexion_detectada: boolean;
  inflexion_mes: string | null;
  inflexion_antelacion_meses: number;
  variable_detonante: string | null;
  score_pred_3m: number | null;
  score_pred_grupo_3m: number | null;
  elegible_credito: boolean;
  decision_accion: Accion;
  limite_sugerido_eur: number;
  limite_vigente_eur: number;
  plazo_max_dias: number;
  tae_operacion: number | null;
  gap_ciclo_dias: number | null;
  producto_embat: ProductoSugerido | null;
  forecast_metodo_solo: string | null;
  forecast_metodo_grupo: string | null;
  version_scoring: string;
  version_forecast: string | null;
};

export type SubmissionSlice = {
  rows: number;
  companies: number;
  months: number;
  estados: Record<Estado, number>;
  tasaElegible: number;
  limiteVigenteEur: number;
};

export type SubmissionSummary = {
  totalRows: number;
  companies: number;
  months: number;
  ultimaObservacion: SubmissionSlice;
  historico: SubmissionSlice;
  versionScoring: string;
  versionsForecast: string[];
};
