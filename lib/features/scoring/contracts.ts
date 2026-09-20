import { z } from "zod";
import { PARAMS, VARIABLES } from "@/lib/features/scoring/params";
import type { Parameters, ScoreRow } from "@/lib/features/scoring/types";

const finite = z.number().finite();
const nullable = finite.nullable();
const nota = finite.min(0).max(100);
const conf = finite.min(0).max(1);
const count = z.number().int().min(0);
const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const id = z.enum(VARIABLES);
const percentiles = z.record(id, z.object({ p5: nullable, p95: nullable }));
const bloqueNota = z.object({ A: nota, B: nota, C: nota });
const bloqueConf = z.object({ A: conf, B: conf, C: conf });
const bloqueNullable = z.object({ A: nullable, B: nullable, C: nullable });
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
/** Solo A1..C6: el holding se publica en campos separados. */
const nContribuciones = VARIABLES.length;

export const parametersSchema = z.object({
  contratoVersion: z.literal(PARAMS.contratoVersion),
  version: z.string().min(1),
  paramsHash: z.string().length(64),
  percentiles,
  trainGroups: z.array(z.string()),
  validationGroups: z.array(z.string()),
  inputFingerprint: z.string().min(1),
  c5P80: nullable,
}) satisfies z.ZodType<Parameters>;

/** Contrato de una fila `company_month_score` (scoring-engine §10). */
export const scoreRowSchema = z.object({
  company: z.string().min(1),
  // El calendario de análisis es cerrado: fuera de [mes_inicio, mes_fin] la fila no existe (§10).
  month: mes.refine((m) => m >= PARAMS.mesInicio && m <= PARAMS.mesFin, {
    message: `month must be within [${PARAMS.mesInicio}, ${PARAMS.mesFin}]`,
  }),
  groupId: z.string().min(1),
  versionParametros: z.string().min(1),
  scoreSolo: nota,
  ajusteHolding: finite.min(-PARAMS.holding.drenajeMax).max(PARAMS.holding.respaldoMax),
  aportacionGrupo: finite.min(-PARAMS.holding.drenajeMax).max(PARAMS.holding.respaldoMax),
  deltaGrupo: finite,
  confianza: conf,
  subscores: bloqueNota,
  confs: bloqueConf,
  estadoSolo: z.enum(["sana", "vigilar", "riesgo", "sin_datos"]),
  estadoGrupo: z.enum(["sana", "vigilar", "riesgo", "sin_datos"]),
  perfilGrupo: z.enum(["filial_subvencionada", "drenaje_tesoreria", "estandar"]),
  variables: z.array(contribution).length(nContribuciones),
  deltaContrib: z.array(z.object({ id, delta: finite })).length(nContribuciones),
  direccion: z.enum(["mejora", "estable", "deterioro"]),
  naturaleza: z.enum(["temporal", "estructural", "sin_cambio"]),
  patronTrayectoria: z.enum([
    "bache_puntual",
    "caida_estructural",
    "inestabilidad_cronica",
    "deterioro_temporal",
    "estable",
    "mejora",
  ]),
  tendScore3m: nullable,
  tendScore6m: nullable,
  tendScore12m: nullable,
  tend3m: bloqueNullable,
  alertaTempranaDeterioro: z.boolean(),
  factorDeterminante: z.object({ id: z.string(), delta: finite, descripcion: z.string() }),
  factorDeterminanteGrupo: z.object({ id: z.string(), delta: finite, descripcion: z.string() }),
  canarioEnMina: z.object({
    detectado: z.boolean(),
    id: z.string().nullable(),
    mensaje: z.string().nullable(),
  }),
  diagnosticoMejora: z.object({ confirmada: z.boolean(), motor: z.string().nullable() }),
  inflexion: z.object({
    hayInflexion: z.boolean(),
    tipo: z.enum(["pico_bajista", "suelo_alcista", "sin_inflexion"]),
    mesInflexion: mes.nullable(),
    antelacionMeses: count,
    scoreInflexion: nota.nullable(),
    canalDesencadenante: z.enum(["comercial", "operativo", "financiero", "holding", "ninguno"]),
    variableDetonante: z.string().nullable(),
    explicacion: z.string(),
  }),
  inflexionGrupo: z.object({
    hayInflexion: z.boolean(),
    tipo: z.enum(["pico_bajista", "suelo_alcista", "sin_inflexion"]),
    mesInflexion: mes.nullable(),
    antelacionMeses: count,
    scoreInflexion: nota.nullable(),
    canalDesencadenante: z.enum(["comercial", "operativo", "financiero", "holding", "ninguno"]),
    variableDetonante: z.string().nullable(),
    explicacion: z.string(),
  }),
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
  scoreGrupo: nota,
  evaluacionEwi: z.object({
    revisionStage2Candidata: z.boolean(),
    ewis: z.object({
      ewi1ImpagoObligaciones: z.boolean(),
      ewi2MorosidadComercial: z.boolean(),
      ewi3TensionCobertura: z.boolean(),
      ewi4DeficitPersistente: z.boolean(),
    }),
  }),
  gapCicloDias: nullable,
  recomendacionEmbat: z.string().nullable(),
  requiereAvalMatriz: z.boolean(),
  alertaPignoracionCaja: z.boolean(),
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
    alertaTempranaDeterioro: z.boolean(),
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
        "alerta_temprana_deterioro",
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
    hardcoreRevolving: z.boolean(),
  }),
}) satisfies z.ZodType<ScoreRow>;
export type ScoreRowDTO = z.infer<typeof scoreRowSchema>;
