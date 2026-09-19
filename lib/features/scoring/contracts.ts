import { z } from "zod";
import { VARIABLES } from "@/lib/features/scoring/params";

const finite = z.number().finite();
const nullable = finite.nullable();
const id = z.enum([...VARIABLES, "grupo"]);
const bloque = z.object({ A: finite, B: finite, C: finite });
const bloqueNullable = z.object({ A: nullable, B: nullable, C: nullable });
const contribution = z.object({
  id,
  raw: nullable,
  subnota: finite.min(0).max(100),
  conf: finite.min(0).max(1),
  aportacion: finite,
  umbralSano: nullable,
  sano: z.boolean().nullable(),
});

/** Contrato de una fila `company_month_score` (scoring-engine §10). */
export const scoreRowSchema = z.object({
  company: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  groupId: z.string().min(1),
  versionParametros: z.string().min(1),
  score: finite.min(0).max(100),
  scoreSolo: finite.min(0).max(100),
  avalGrupo: finite.min(-20).max(20),
  confianza: finite.min(0).max(1),
  subscores: bloque,
  confs: bloque,
  estado: z.enum(["sana", "vigilar", "riesgo", "sin_datos"]),
  variables: z.array(contribution).length(15),
  deltaContrib: z.array(z.object({ id, delta: finite })).length(15),
  direccion: z.enum(["mejora", "estable", "deterioro"]),
  naturaleza: z.enum(["temporal", "estructural", "sin_cambio"]),
  tendScore3m: nullable,
  tend3m: bloqueNullable,
  rachaB2: z.number().int().min(0),
  rachaDeficit: z.number().int().min(0),
  C3dias: nullable,
  C4: nullable,
  cobrosOpMedia3m: finite,
  cobrosOpMedia6m: finite,
  pagosOpMedia6m: finite,
  servicioDeudaMedia6m: finite,
  amortCreditoMedia6m: finite,
  obligacionesRecMedia6m: finite,
  capacidadCuotaAdv: finite.min(0),
  D1: finite.min(0).max(1),
  D2: nullable,
  D3: nullable,
  D4: nullable,
  D5: finite.min(0),
  confD: finite.min(0).max(1),
  tienePrestamoIntragrupo: z.boolean(),
  cobrosOpGrupoMedia6m: finite,
  pagosOpGrupoMedia6m: finite,
  servicioDeudaGrupoMedia6m: finite,
  scoreGrupo: nullable,
  deficitMes: z.boolean().nullable(),
  margenMes: nullable,
  senales: z.object({
    deterioro: z.boolean(),
    estructural: z.boolean(),
    mejora: z.boolean(),
    deficit: z.boolean(),
    impago: z.boolean(),
    vencidoAlto: z.boolean(),
    contagio: z.boolean(),
    datosInsuficientes: z.boolean(),
  }),
  alertas: z.array(
    z.object({
      tipo: z.enum([
        "deterioro",
        "deterioro_estructural",
        "recuperacion",
        "deficit_persistente",
        "impago_obligaciones",
        "vencido_alto",
        "contagio_grupo",
        "datos_insuficientes",
      ]),
      desdeMes: z.string(),
    }),
  ),
  cobertura: z.object({
    mesesObs6m: z.number().int(),
    mesesObs12m: z.number().int(),
    pctClasificado6m: finite.min(0).max(1),
    nFacturasCli6m: z.number().int(),
    nFacturasProv6m: z.number().int(),
    tieneLineaCredito: z.boolean(),
    tieneCuotas: z.boolean(),
    C4Estimado: z.boolean(),
    nHermanasConDatos: z.number().int(),
  }),
});
export type ScoreRowDTO = z.infer<typeof scoreRowSchema>;
