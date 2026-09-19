import { z } from "zod";

const finite = z.number().finite();
const contribution = z.object({
  indicator: z.string(),
  raw: finite.nullable(),
  subscore: finite.min(0).max(100),
  weight: finite.min(0).max(1),
  confidence: finite.min(0).max(1),
  contribution: finite.min(0).max(100),
});
export const scoreResultSchema = z.object({
  company: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  score: finite.min(0).max(100),
  confidence: finite.min(0).max(1),
  monthlyDeficit: z.boolean().nullable(),
  monthlyMargin: finite.nullable(),
  trend3m: finite.nullable(),
  direction: z.enum(["mejora", "estable", "deterioro"]),
  nature: z.enum(["temporal", "estructural", "sin_cambio"]),
  contributions: z.array(contribution).length(12),
  deltas: z.array(z.object({ indicator: z.string(), delta: finite })).length(12),
  baseCapacity: finite.nonnegative(),
  adverseCapacity: finite.nonnegative(),
  capacityLimit: finite.nonnegative(),
  operatingLimit: finite.nonnegative(),
  recommendedLimit: finite.nonnegative(),
  appliedLimit: finite.nonnegative(),
  band: z.enum(["A", "B", "C", "D"]),
  price: finite.nullable(),
  action: z.enum(["abrir", "ampliar", "mantener", "reducir", "cerrar"]),
  reason: z.string(),
  alerts: z.array(
    z.object({
      type: z.string(),
      indicator: z.string(),
      onsetMonth: z.string(),
      confirmedMonth: z.string(),
    }),
  ),
  coverage: z.object({
    observedMonths: z.number().int().min(0).max(6),
    classifiedShare: finite.min(0).max(1),
    hasInvoices: z.boolean(),
    hasDebt: z.boolean(),
    invoiceHistoryEstimated: z.literal(true),
  }),
  parameterVersion: z.string().length(64),
});
export type ScoreResultDTO = z.infer<typeof scoreResultSchema>;
