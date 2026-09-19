import { z } from "zod";
import type { ForecastRow } from "@/lib/features/forecast/types";
import { PARAMS, VARIABLES } from "@/lib/features/scoring/params";

const finite = z.number().finite();
const nota = finite.min(0).max(100);
const conf = finite.min(0).max(1);
const nullable = finite.nullable();
const count = z.number().int().min(0);
const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const banda = z.enum(["A", "B", "C", "D"]);
const id = z.enum([...VARIABLES, "grupo"] as const);
const contribution = z.object({
  id,
  raw: nullable,
  subnota: nota,
  conf,
  aportacion: finite,
  umbralSano: nullable,
  sano: z.boolean().nullable(),
});
const driver = z.object({
  id,
  valorActual: nullable,
  valorPred: nullable,
  deltaAportacion: finite,
});
const horizonte = z.object({
  scorePred: nota,
  bandaPred: banda,
  p10: nota,
  p90: nota,
  cascadaPred: z.array(contribution).length(VARIABLES.length + 1),
  drivers: z.array(driver).max(3),
  rachaDeficitPred: count,
  rachaB2Pred: count,
});

/** Contrato de una fila `company_month_forecast` (forecast-engine §8). */
export const forecastRowSchema = z.object({
  company: z.string().min(1),
  month: mes.refine((m) => m >= PARAMS.mesInicio && m <= PARAMS.mesFin),
  groupId: z.string().min(1),
  versionParametros: z.string().min(1),
  horizontes: z.object({ 3: horizonte, 6: horizonte }),
  direccionPred: z.enum(["mejora", "estable", "deterioro"]),
  probDeterioro6m: conf.nullable(),
  sinTendencia: z.array(z.enum(VARIABLES)),
  metodo: z.enum(["v1_proyeccion", "v2_modelo", "desconectado"]),
}) satisfies z.ZodType<ForecastRow>;
export type ForecastRowDTO = z.infer<typeof forecastRowSchema>;
