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
const variableId = z.enum(VARIABLES);
const id = z.enum([...VARIABLES, "holding"] as const);
const contribution = z.object({
  id,
  raw: nullable,
  subnota: nota.nullable(),
  conf,
  peso: finite.min(0),
  pesoEfectivo: finite.min(0),
  aportacion: finite,
  umbralSano: nullable,
  sano: z.boolean().nullable(),
  aplicable: z.boolean(),
});
const driver = z.object({
  id,
  valorActual: nullable,
  valorPred: nullable,
  deltaAportacion: finite,
});
const residuos = z.record(
  z.enum(["3", "6"]),
  z.record(banda, z.object({ p10: finite, p90: finite })),
);
const pDet = z.record(z.enum(["A", "B", "C", "D"]), z.record(banda, conf.nullable()));
const ajuste = z.object({
  filas3m: count,
  mae3m: finite.nullable(),
  mae3mBaseline: finite.nullable(),
  aciertoBanda3m: conf.nullable().optional(),
  aciertoBandaBaseline3m: conf.nullable().optional(),
});
const targetParameters = z.object({
  residuos,
  pDet,
  conectado: z.boolean(),
  ajuste,
});
const horizonte = z
  .object({
    scoreSoloPred: nota,
    bandaSoloPred: banda,
    p10Solo: nota,
    p90Solo: nota,
    scoreGrupoPred: nota,
    bandaGrupoPred: banda,
    p10Grupo: nota,
    p90Grupo: nota,
    ajusteHoldingPred: finite.min(-PARAMS.holding.drenajeMax).max(PARAMS.holding.respaldoMax),
    cascadaPred: z.array(contribution).length(VARIABLES.length + 1),
    driversSolo: z.array(driver).max(3),
    driversGrupo: z.array(driver).max(3),
    rachaDeficitPred: count,
    rachaB2Pred: count,
    scorePred: nota,
    bandaPred: banda,
    p10: nota,
    p90: nota,
    drivers: z.array(driver).max(3),
  })
  .refine((value) => value.p10Solo <= value.p90Solo && value.p10Grupo <= value.p90Grupo, {
    message: "forecast intervals must be ordered",
  });

export const forecastRowSchema = z.object({
  company: z.string().min(1),
  month: mes.refine((m) => m >= PARAMS.mesInicio && m <= PARAMS.mesFin),
  groupId: z.string().min(1),
  versionParametros: z.string().min(1),
  horizontes: z.object({ 3: horizonte, 6: horizonte }),
  direccionSoloPred: z.enum(["mejora", "estable", "deterioro"]),
  direccionGrupoPred: z.enum(["mejora", "estable", "deterioro"]),
  probDeterioroSolo6m: conf.nullable(),
  probDeterioroGrupo6m: conf.nullable(),
  sinTendencia: z.array(z.enum(VARIABLES)),
  metodoSolo: z.enum(["v1_proyeccion", "v2_modelo", "desconectado"]),
  metodoGrupo: z.enum(["v1_proyeccion", "v2_modelo", "desconectado"]),
  direccionPred: z.enum(["mejora", "estable", "deterioro"]),
  probDeterioro6m: conf.nullable(),
  metodo: z.enum(["v1_proyeccion", "v2_modelo", "desconectado"]),
}) satisfies z.ZodType<ForecastRow>;
export type ForecastRowDTO = z.infer<typeof forecastRowSchema>;

export const forecastParametersSchema = z.object({
  version: z.string().min(1),
  paramsHash: z.string().min(1),
  versionScoring: z.string().min(1),
  clip: z.record(variableId, z.object({ p1: finite.nullable(), p99: finite.nullable() })),
  solo: targetParameters,
  grupo: targetParameters,
  residuos,
  pDet,
  conectado: z.boolean(),
  ajuste,
});
