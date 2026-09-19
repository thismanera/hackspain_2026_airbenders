import type { BlockId } from "./indicators";

export type Estado = "sana" | "vigilar" | "riesgo" | "sin_datos";
export type Direccion = "mejora" | "estable" | "deterioro";
export type Naturaleza = "temporal" | "estructural" | "sin_cambio";
export type Banda = "A" | "B" | "C" | "D";
export type Accion = "abrir" | "ampliar" | "mantener" | "reducir" | "cerrar";

/** Aportación de una variable al score del mes, con su delta contra el mes anterior. */
export type Contribution = {
  indicator: string;
  /** Valor bruto de la variable. `null` = no hay dato para esta empresa. */
  raw: number | null;
  /** Escala 0-100, ya invertida si la variable es "mejor bajo". */
  subscore: number;
  confidence: number;
  /** Peso efectivo dentro del score total (peso de bloque × peso intrabloque). */
  weight: number;
  /** Puntos que esta variable aporta al score. */
  contribution: number;
  /** Cambio de esa aportación respecto al mes anterior. */
  delta: number;
};

export type Alert = {
  type: string;
  /** Texto en llano de qué se detectó. */
  label: string;
  indicator: string;
  /** Mes en el que la señal apareció por primera vez. */
  onsetMonth: string;
  /** Mes en el que se confirmó y disparó la alerta. */
  confirmedMonth: string;
  severity: "aviso" | "critica";
};

export type Coverage = {
  /** Meses con movimientos dentro de la ventana de 6. */
  observedMonths: number;
  /** Proporción del volumen con categoría fiable (decisión #2). */
  classifiedShare: number;
  hasInvoices: boolean;
  hasDebt: boolean;
  hasCreditLine: boolean;
};

/** Una puerta de elegibilidad de SOURCE §2.0. La primera que falla es el motivo. */
export type Gate = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

/** Un punto de la región factible (SOURCE §2.4): plazo, cuánto y a qué precio. */
export type TenorOption = {
  days: number;
  maxAmount: number;
  apr: number;
  cost: number;
};

export type Decision = {
  eligible: boolean;
  /** Frase en llano: por qué se presta, o cuál es la puerta que falla. */
  reason: string;
  gates: Gate[];
  band: Banda;
  limit: number;
  previousLimit: number;
  maxTenorDays: number;
  baseApr: number;
  apr: number;
  menu: TenorOption[];
  action: Accion;
  adverseCapacity: number;
  capacityLimit: number;
  operatingLimit: number;
};

/** Bloque D de SOURCE §1.7: cuánto mueve el grupo al score de la empresa. */
export type GroupAdjustment = {
  groupId: string;
  siblings: number;
  /** w = w_max × min(1, D5 / 0,2). */
  weight: number;
  /** D2: score del resto del grupo, ponderado por cobros. */
  peerScore: number;
  /** D3: capacidad de aval del resto del grupo. */
  support: number;
  /** D1: peso de la empresa dentro del grupo. */
  share: number;
  /** D5: interdependencia con el grupo. */
  interdependence: number;
  /** Puntos sumados o restados al score autónomo. Tope -30/+20. */
  adjustment: number;
};

export type MonthScore = {
  company: string;
  month: string;
  /** Nota autónoma (`scoreSolo`); el contexto del holding vive en `group` y `scoreGrupo`. */
  score: number;
  /** Score antes del ajuste de grupo. */
  standaloneScore: number;
  confidence: number;
  estado: Estado;
  blocks: Record<BlockId, number>;
  contributions: Contribution[];
  trend3m: number | null;
  direction: Direccion;
  nature: Naturaleza;
  group: GroupAdjustment | null;
  decision: Decision;
  alerts: Alert[];
  coverage: Coverage;
  /** Contrato scoring real cuando la ficha procede de Prisma; los fixtures mantienen el formato v1. */
  scoreSolo?: number;
  scoreGrupo?: number;
  forecast?: {
    scoreSoloPred3m: number;
    scoreGrupoPred3m: number;
    scoreSoloPred6m: number;
    scoreGrupoPred6m: number;
    p10Solo3m: number;
    p90Solo3m: number;
    p10Grupo3m: number;
    p90Grupo3m: number;
    metodoSolo: string;
    metodoGrupo: string;
  } | null;
};

export type CompanyMeta = {
  id: string;
  groupId: string;
  country: string;
  currency: string;
  erp: string;
  /** Cuántas empresas tiene su grupo en la muestra, ella incluida. */
  groupSize: number;
};

/** Fila de la tabla de cartera: lo justo para triar sin abrir la ficha. */
export type PortfolioRow = {
  company: CompanyMeta;
  month: string;
  score: number;
  confidence: number;
  estado: Estado;
  trend3m: number | null;
  direction: Direccion;
  nature: Naturaleza;
  band: Banda;
  limit: number;
  previousLimit: number;
  apr: number | null;
  action: Accion;
  /**
   * Si este mes pasa algo que el analista no sabía. Cerrar una línea viva cuenta;
   * seguir sin línea una empresa que nunca la tuvo, no.
   */
  changed: boolean;
  eligible: boolean;
  /**
   * Etiqueta corta de la primera puerta que falla, o `null` si pasa todas. Una
   * empresa puede tener score 80 y aun así no recibir línea: las puertas de
   * SOURCE §2.0 son independientes del score, y la tabla tiene que decir cuál es
   * en lugar de dejar al analista con un "Sana → Cerrar" sin explicación.
   */
  blockedBy: string | null;
  reason: string;
  alertCount: number;
  /** Últimos 12 scores, para la sparkline. */
  spark: number[];
  /** D1: peso de la empresa dentro de su grupo. 1 si va sola. */
  share: number;
};

export type PortfolioSummary = {
  month: string;
  total: number;
  byEstado: Record<Estado, number>;
  byDireccion: Record<Direccion, number>;
  /** Solo cuenta las acciones que son noticia (`changed`). */
  byAccion: Record<Accion, number>;
  /** Empresas que pasan todas las puertas y tienen límite. */
  eligible: number;
  /** Suma de límites de las empresas elegibles. */
  exposure: number;
  /** Empresas cuya acción no es "mantener" este mes. */
  moved: number;
};

export type PortfolioResponse = {
  month: string;
  months: string[];
  summary: PortfolioSummary;
  /** Mismo filtro, mes anterior. `null` en el primer mes del calendario. */
  previous: PortfolioSummary | null;
  /** Mismo filtro, cada mes del calendario hasta el seleccionado, en orden. */
  history: PortfolioSummary[];
  rows: PortfolioRow[];
  /** Filas antes de aplicar filtros, para distinguir "cartera vacía" de "filtro vacío". */
  totalUnfiltered: number;
};

export type GroupPeer = {
  id: string;
  score: number;
  estado: Estado;
  /** Peso del hermano dentro del grupo (D1). */
  share: number;
};

/** Una empresa vista desde su grupo: lo justo para el techo y el grafo de flujo. */
export type GroupMember = {
  id: string;
  score: number;
  previousScore: number | null;
  estado: Estado;
  direction: Direccion;
  /** D1. */
  share: number;
  /** D5. 0 si va sola. */
  interdependence: number;
  /** D3. 0 si va sola. */
  support: number;
  /** Puntos que el grupo suma o resta a su score. */
  adjustment: number;
  limit: number;
  previousLimit: number;
  eligible: boolean;
  action: Accion;
  changed: boolean;
  alertCount: number;
  blockedBy: string | null;
};

export type GroupHistoryPoint = {
  month: string;
  /** Media de scores ponderada por D1. */
  score: number;
  /** Suma de límites vivos. */
  exposure: number;
};

export type GroupFileResponse = {
  groupId: string;
  month: string;
  months: string[];
  members: GroupMember[];
  score: number;
  previousScore: number | null;
  byEstado: Record<Estado, number>;
  exposure: number;
  previousExposure: number;
  eligible: number;
  /** D5 medio ponderado por D1. */
  interdependence: number;
  /** Empresas con D1 ≥ 0,3 que cierran este mes: arrastran al resto (cross-default). */
  crossDefault: string[];
  history: GroupHistoryPoint[];
};

export type CompanyFileResponse = {
  company: CompanyMeta;
  month: string;
  months: string[];
  latest: MonthScore;
  previous: MonthScore | null;
  history: MonthScore[];
  peers: GroupPeer[];
};
