import { z } from "zod";

const finite = z.number().finite();
export const decisionRowSchema = z.object({
  company: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  motor: z.literal("legacy"),
  banda: z.enum(["A", "B", "C", "D"]),
  precio: finite.nullable(),
  capacidadBase: finite.min(0),
  capacidadAdv: finite.min(0),
  limiteCap: finite.min(0),
  limiteOp: finite.min(0),
  limiteRecomendado: finite.min(0),
  limiteVigente: finite.min(0),
  accion: z.enum(["abrir", "ampliar", "mantener", "reducir", "cerrar"]),
  motivo: z.string(),
});
export type DecisionRowDTO = z.infer<typeof decisionRowSchema>;
