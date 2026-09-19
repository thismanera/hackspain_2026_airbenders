import { z } from "zod";
import { DECISION_PARAMS } from "@/lib/features/decision/params";
import { PUERTAS, type DecisionRow } from "@/lib/features/decision/types";
import { PARAMS } from "@/lib/features/scoring/params";

const finite = z.number().finite();
const money = finite.min(0);
const banda = z.enum(["A", "B", "C", "D"]);
const accion = z.enum(["abrir", "ampliar", "mantener", "reducir", "cerrar"]);
const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const desglose = z.object({
  base: finite,
  primaPlazo: finite.min(0),
  primaConfianza: finite.min(0),
  ajusteTendencia: finite,
  primaPrevision: finite.min(0),
});
const opcion = z.object({
  plazo: z.number().int().positive(),
  cantidadMax: money,
  tae: finite.min(0).max(1),
  costeMax: money,
  desglose,
});
const estado = z.object({
  LPrev: money,
  accionPrev: accion.nullable(),
  mesesElegibleSeguidos: z.number().int().min(0),
  mesesReduccionSeguidos: z.number().int().min(0),
  mesesPredPeorSeguidos: z.number().int().min(0),
  cerradoDesde: mes.nullable(),
  crossDefaultActivo: z.boolean(),
  causaCrossDefault: z.string().nullable(),
  mesesConCrossDefault: z.number().int().min(0),
  mesesPuertaBlandaSeguidos: z.number().int().min(0),
});

export const decisionRowSchema = z.object({
  company: z.string().min(1),
  month: mes.refine((m) => m >= PARAMS.mesInicio && m <= PARAMS.mesFin),
  groupId: z.string().min(1),
  motor: z.literal("v1"),
  versionParametros: z.string().min(1),
  elegible: z.boolean(),
  motivo: z.string().nullable(),
  puertasFallidas: z.array(z.enum(PUERTAS)),
  cierrePendiente: z.boolean(),
  banda,
  bandaEfectiva: banda,
  capacidadCuotaAdv: money,
  limiteCap: money,
  limiteOp: money,
  L: money,
  LVigente: money,
  TMax: z
    .number()
    .int()
    .min(0)
    .max(Math.max(...Object.values(DECISION_PARAMS.tMax).map((t) => t.base))),
  menu: z.array(opcion),
  plazoNaturalAnticipo: z.number().int().positive(),
  accion,
  motivoAccion: z.string(),
  motivoGrupo: z.string().nullable(),
  bandaPred3mUsada: banda.nullable(),
  estado,
}) satisfies z.ZodType<DecisionRow>;
export type DecisionRowDTO = z.infer<typeof decisionRowSchema>;
