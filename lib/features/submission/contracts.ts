import { z } from "zod";
import type { SubmissionRow } from "@/lib/features/submission/types";

const finite = z.number().finite();
const score = finite.min(0).max(100);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const estado = z.enum(["sana", "vigilar", "riesgo", "sin_datos"]);
const direccion = z.enum(["mejora", "estable", "deterioro"]);
const patron = z.enum([
  "bache_puntual",
  "caida_estructural",
  "inestabilidad_cronica",
  "deterioro_temporal",
  "estable",
  "mejora",
]);
const accion = z.enum(["abrir", "ampliar", "mantener", "reducir", "cerrar"]);
const producto = z.enum([
  "embat_factoring",
  "embat_confirming",
  "reestructuracion_deuda",
  "cortafuegos_holding",
  "gestion_cobros",
  "ninguno",
]);

export const submissionRowSchema = z.object({
  company_id: z.string().min(1),
  month,
  group_id: z.string().min(1),
  score_solo: score,
  score_grupo: score,
  ajuste_holding: finite,
  estado,
  direccion,
  patron_trayectoria: patron,
  alerta_temprana: z.boolean(),
  canario_en_mina: z.boolean(),
  inflexion_detectada: z.boolean(),
  inflexion_mes: month.nullable(),
  inflexion_antelacion_meses: z.number().int().min(0),
  variable_detonante: z.string().min(1).nullable(),
  score_pred_3m: score.nullable(),
  score_pred_grupo_3m: score.nullable(),
  elegible_credito: z.boolean(),
  decision_accion: accion,
  limite_sugerido_eur: finite.min(0),
  limite_vigente_eur: finite.min(0),
  plazo_max_dias: z.number().int().min(0),
  tae_operacion: finite.min(0).max(1).nullable(),
  gap_ciclo_dias: finite.nullable(),
  producto_embat: producto.nullable(),
  forecast_metodo_solo: z.string().min(1).nullable(),
  forecast_metodo_grupo: z.string().min(1).nullable(),
  version_scoring: z.string().min(1),
  version_forecast: z.string().min(1).nullable(),
}) satisfies z.ZodType<SubmissionRow>;

export type SubmissionRowDTO = z.infer<typeof submissionRowSchema>;
