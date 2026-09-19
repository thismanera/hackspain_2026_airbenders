import { z } from "zod";
import { PARAMS, VARIABLES } from "@/lib/features/scoring/params";
import type { ScoreRow } from "@/lib/features/scoring/types";

const finite = z.number().finite();
const nullable = finite.nullable();
const nota = finite.min(0).max(100);
const conf = finite.min(0).max(1);
const count = z.number().int().min(0);
const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const id = z.enum([...VARIABLES, "grupo"] as const);
const bloqueNota = z.object({ A: nota, B: nota, C: nota });
const bloqueConf = z.object({ A: conf, B: conf, C: conf });
const bloqueNullable = z.object({ A: nullable, B: nullable, C: nullable });
const contribution = z.object({
  id,
  raw: nullable,
  subnota: nota,
  conf,
  aportacion: finite,
  umbralSano: nullable,
  sano: z.boolean().nullable(),
});
/** A1..C6 más la fila `grupo` del aval (§7). */
const nContribuciones = VARIABLES.length + 1;

/** Contrato de una fila `company_month_score` (scoring-engine §10). */
export const scoreRowSchema = z.object({
  company: z.string().min(1),
  // El calendario de análisis es cerrado: fuera de [mes_inicio, mes_fin] la fila no existe (§10).
  month: mes.refine((m) => m >= PARAMS.mesInicio && m <= PARAMS.mesFin, {
    message: `month must be within [${PARAMS.mesInicio}, ${PARAMS.mesFin}]`,
  }),
  groupId: z.string().min(1),
  versionParametros: z.string().min(1),
  score: nota,
  scoreSolo: nota,
  avalGrupo: finite.min(-PARAMS.avalMax).max(PARAMS.avalMax),
  confianza: conf,
  subscores: bloqueNota,
  confs: bloqueConf,
  estado: z.enum(["sana", "vigilar", "riesgo", "sin_datos"]),
  variables: z.array(contribution).length(nContribuciones),
  deltaContrib: z.array(z.object({ id, delta: finite })).length(nContribuciones),
  direccion: z.enum(["mejora", "estable", "deterioro"]),
  naturaleza: z.enum(["temporal", "estructural", "sin_cambio"]),
  tendScore3m: nullable,
  tend3m: bloqueNullable,
  rachaB2: count,
  rachaDeficit: count,
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
  // D2 es la media ponderada de los `score_solo` de las hermanas: NA sin hermanas, si no [0,100].
  D2: nota.nullable(),
  D3: nullable,
  D4: nullable,
  D5: finite.min(0),
  confD: conf,
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
      desdeMes: mes,
    }),
  ),
  cobertura: z.object({
    mesesObs6m: count.max(6),
    mesesObs12m: count.max(12),
    pctClasificado6m: conf,
    nFacturasCli6m: count,
    nFacturasProv6m: count,
    tieneLineaCredito: z.boolean(),
    tieneCuotas: z.boolean(),
    C4Estimado: z.boolean(),
    importesExcluidosEur: finite.min(0),
    nHermanasConDatos: count,
  }),
}) satisfies z.ZodType<ScoreRow>;
export type ScoreRowDTO = z.infer<typeof scoreRowSchema>;
