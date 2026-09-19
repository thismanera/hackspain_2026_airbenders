import type { Banda } from "@/lib/features/decision/params";
import type { AlertTipo, Direccion, Estado, Naturaleza } from "@/lib/features/scoring/types";

export type { Banda };

/**
 * Decisión 43 — contrato de entrada mínimo. El motor de decisión NO lee `ScoreRow`: lee esta
 * proyección, que `proyectar` (input.ts) construye y que es el único punto de contacto con el
 * contrato de scoring.
 *
 * Qué entra: el score y sus pilares (`subscores`), la confianza, el estado y la tendencia
 * (`direccion`, `naturaleza`, `tendScore3m`, `tend3m`), los **tipos** de alerta, lo que define al
 * grupo (`D1`, `D5`, `avalGrupo`) y **una** variable de escala en euros, `tamano`
 * (= `cobrosOpMedia3m`).
 *
 * Qué NO entra, y por qué: los flujos a 6 meses, `capacidadCuotaAdv`, `rachaB2`, `rachaDeficit`,
 * `C3dias`, `C4`, los flujos consolidados del grupo, `senales` y `cobertura`. Scoring ya condensó
 * esos datos en el score, en sus pilares y en las alertas; volver a leerlos aquí era decidir dos
 * veces sobre la misma evidencia, con dos umbrales distintos y sin forma de explicarlo en la
 * ficha. Los euros sí necesitan una escala, y por eso `tamano` se queda.
 */
export type DecisionInput = {
  company: string;
  month: string;
  groupId: string;
  versionScoring: string;
  score: number;
  confianza: number;
  subscores: Record<"A" | "B" | "C", number>;
  estado: Estado;
  direccion: Direccion;
  naturaleza: Naturaleza;
  tendScore3m: number | null;
  tend3m: Record<"A" | "B" | "C", number | null>;
  alertas: AlertTipo[];
  D1: number;
  D5: number;
  avalGrupo: number;
  /** Única variable en euros del contrato: escala del anticipo (`cobrosOpMedia3m`). */
  tamano: number;
};
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
   * Decisión 42: meses seguidos fallando **solo** puertas blandas (`historia`, o `caja` por el
   * umbral del pilar A). A `cierreConfirmadoMeses` el cierre se confirma; un mes suelto no
   * cierra (§8).
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
  /** Decisión 43: la escala en euros con la que se ha decidido (`cobrosOpMedia3m`). */
  tamano: number;
  /** Decisión 45: recorte por capacidad de deuda del pilar A, `min(1, A / 70)`. */
  factorA: number;
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
