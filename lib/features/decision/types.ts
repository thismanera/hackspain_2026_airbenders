import type { Banda } from "@/lib/features/decision/params";
import type { Direccion } from "@/lib/features/scoring/types";

export type { Banda };
export type Accion = "abrir" | "ampliar" | "mantener" | "reducir" | "cerrar";
export const PUERTAS = ["historia", "estado", "fiabilidad", "caja", "clientes", "grupo"] as const;
export type Puerta = (typeof PUERTAS)[number];

/** Estado que el motor arrastra de un mes al siguiente (decision-engine §8). */
export type EstadoDecision = {
  LPrev: number;
  accionPrev: Accion | null;
  mesesElegibleSeguidos: number;
  mesesReduccionSeguidos: number;
  mesesPredPeorSeguidos: number;
  cerradoDesde: string | null;
  crossDefaultActivo: boolean;
  causaCrossDefault: string | null;
  /** Meses seguidos con la bandera de cross-default encendida: a `reaperturaMeses` se levanta (§9). */
  mesesConCrossDefault: number;
  /**
   * Decisión 42: meses seguidos fallando **solo** puertas blandas (`historia`, o `caja` por
   * capacidad). A `cierreConfirmadoMeses` el cierre se confirma; un mes suelto no cierra (§8).
   */
  mesesPuertaBlandaSeguidos: number;
};

export const ESTADO_INICIAL: EstadoDecision = {
  LPrev: 0,
  accionPrev: null,
  mesesElegibleSeguidos: 0,
  mesesReduccionSeguidos: 0,
  mesesPredPeorSeguidos: 0,
  cerradoDesde: null,
  crossDefaultActivo: false,
  causaCrossDefault: null,
  mesesConCrossDefault: 0,
  mesesPuertaBlandaSeguidos: 0,
};

/**
 * Descomposición aditiva de la TAE (§6): `tae = base + primaPlazo + primaConfianza +
 * ajusteTendencia + primaPrevision`. **Todos** los campos son componentes en puntos porcentuales
 * que se suman (el ajuste de tendencia es negativo cuando la dirección es de mejora); ninguno es
 * un factor ni un total.
 */
export type DesgloseTae = {
  base: number;
  primaPlazo: number;
  primaConfianza: number;
  ajusteTendencia: number;
  primaPrevision: number;
};

export type MenuOption = {
  plazo: number;
  cantidadMax: number;
  tae: number;
  costeMax: number;
  desglose: DesgloseTae;
};

/** Entrada opcional del forecast-engine (§1). Sin previsión: `metodo = "desconectado"` y `bandaPred3m = banda`. */
export type PrevisionInput = {
  bandaPred3m: Banda;
  scorePred3m: number | null;
  direccionPred: Direccion | null;
  probDeterioro6m: number | null;
  metodo: "v1_proyeccion" | "v2_modelo" | "desconectado";
};

/** Contrato decision-engine §10. */
export type DecisionRow = {
  company: string;
  month: string;
  groupId: string;
  motor: "v1";
  versionParametros: string;
  elegible: boolean;
  motivo: string | null;
  puertasFallidas: Puerta[];
  /**
   * Decisión 42: la empresa falla una puerta blanda pero el cierre espera confirmación. La fila
   * sale `elegible = false` con `motivo` de la puerta y conserva `L_vigente = L_prev` un mes más.
   */
  cierrePendiente: boolean;
  banda: Banda;
  bandaEfectiva: Banda;
  capacidadCuotaAdv: number;
  limiteCap: number;
  limiteOp: number;
  L: number;
  LVigente: number;
  TMax: number;
  menu: MenuOption[];
  plazoNaturalAnticipo: number;
  accion: Accion;
  motivoAccion: string;
  motivoGrupo: string | null;
  bandaPred3mUsada: Banda | null;
  estado: EstadoDecision;
};

export type DecisionParameters = {
  version: string;
  paramsHash: string;
  versionScoring: string;
};
