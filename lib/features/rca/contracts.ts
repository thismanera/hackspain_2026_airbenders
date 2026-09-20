import { z } from "zod";

import type { AnalisisPostInflexion, DecisionPostInflexion } from "@/lib/features/rca/types";

const finite = z.number().finite();
const score = finite.min(0).max(100);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const decisionPostInflexionSchema = z
  .object({
    variable: z.string().min(1),
    canal: z.enum(["operativo", "financiero", "comercial", "holding"]),
    tipo: z.enum(["acierto_mitigante", "error_agravante"]),
    productoSugerido: z.enum([
      "embat_factoring",
      "embat_confirming",
      "reestructuracion_deuda",
      "cortafuegos_holding",
      "gestion_cobros",
      "ninguno",
    ]),
    deltaPuntos: finite,
    descripcion: z.string().min(1),
    leccionAprendida: z.string().min(1),
    accionRecomendada: z.string().min(1),
  })
  .superRefine((decision, ctx) => {
    if (decision.tipo === "acierto_mitigante" && decision.deltaPuntos <= 0)
      ctx.addIssue({ code: "custom", path: ["deltaPuntos"], message: "debe ser positivo" });
    if (decision.tipo === "error_agravante" && decision.deltaPuntos >= 0)
      ctx.addIssue({ code: "custom", path: ["deltaPuntos"], message: "debe ser negativo" });
  }) satisfies z.ZodType<DecisionPostInflexion>;

const contextoHoldingSchema = z
  .object({
    deltaPuntos: finite,
    observacion: decisionPostInflexionSchema.nullable(),
  })
  .superRefine((contexto, ctx) => {
    if (
      contexto.observacion !== null &&
      Math.abs(contexto.observacion.deltaPuntos - contexto.deltaPuntos) > 1e-9
    )
      ctx.addIssue({
        code: "custom",
        path: ["observacion", "deltaPuntos"],
        message: "debe coincidir con el delta del holding",
      });
  });

export const analisisPostInflexionSchema = z
  .object({
    company: z.string().min(1),
    mesActual: month,
    mesInflexion: month,
    mesesTranscurridos: z.number().int().min(2),
    scoreEnInflexion: score,
    scoreActual: score,
    deltaScoreTotal: finite,
    scoreRecuperableEstimado: score,
    scoreRecuperableGrupoEstimado: score,
    tipoInflexion: z.enum(["pico_bajista", "suelo_alcista"]),
    detonanteOriginal: z.object({
      id: z.string().min(1),
      canal: z.string().min(1),
      descripcion: z.string(),
    }),
    aciertos: z
      .array(decisionPostInflexionSchema)
      .describe(
        "Hallazgos con plantilla y materialidad suficiente; no descomponen todo el cambio del score.",
      ),
    errores: z
      .array(decisionPostInflexionSchema)
      .describe(
        "Hallazgos con plantilla y materialidad suficiente; no descomponen todo el cambio del score.",
      ),
    diagnosticoRespuesta: z.enum([
      "reaccion_resiliente",
      "reaccion_destructiva",
      "reaccion_pasiva",
      "en_recuperacion",
    ]),
    playbook: z.object({
      mantener: z.array(z.string().min(1)),
      evitar: z.array(z.string().min(1)),
      accionesInmediatas: z.array(z.string().min(1)),
    }),
    contextoHolding: contextoHoldingSchema,
  })
  .superRefine((analysis, ctx) => {
    const [startYear, startMonth] = analysis.mesInflexion.split("-").map(Number);
    const [endYear, endMonth] = analysis.mesActual.split("-").map(Number);
    const elapsed = (endYear - startYear) * 12 + endMonth - startMonth;
    if (analysis.mesesTranscurridos !== elapsed)
      ctx.addIssue({
        code: "custom",
        path: ["mesesTranscurridos"],
        message: "debe coincidir con la distancia entre los meses",
      });
    const expectedDelta =
      Math.round((analysis.scoreActual - analysis.scoreEnInflexion) * 1000) / 1000;
    if (Math.abs(analysis.deltaScoreTotal - expectedDelta) > 1e-9)
      ctx.addIssue({
        code: "custom",
        path: ["deltaScoreTotal"],
        message: "debe coincidir con la variación del score autónomo",
      });
    if (analysis.scoreRecuperableGrupoEstimado < analysis.scoreRecuperableEstimado)
      ctx.addIssue({
        code: "custom",
        path: ["scoreRecuperableGrupoEstimado"],
        message: "no puede ser inferior al escenario autónomo",
      });
    analysis.aciertos.forEach((decision, index) => {
      if (decision.tipo !== "acierto_mitigante")
        ctx.addIssue({
          code: "custom",
          path: ["aciertos", index, "tipo"],
          message: "los aciertos deben ser mitigantes",
        });
    });
    analysis.errores.forEach((decision, index) => {
      if (decision.tipo !== "error_agravante")
        ctx.addIssue({
          code: "custom",
          path: ["errores", index, "tipo"],
          message: "los errores deben ser agravantes",
        });
    });
  }) satisfies z.ZodType<AnalisisPostInflexion>;

export type AnalisisPostInflexionDTO = z.infer<typeof analisisPostInflexionSchema>;
