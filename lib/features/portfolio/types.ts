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
  /** Puntos sumados o restados al score en solitario. Tope ±20. */
  adjustment: number;
};

export type MonthScore = {
  company: string;
  month: string;
  /** Score final, ya con el ajuste de grupo aplicado. */
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

/** Dónde estaba la empresa un mes: hoy (score) y hacia dónde iba (trend3m). */
export type TrailPoint = {
  month: string;
  score: number;
  trend3m: number;
};

/**
 * Por qué una empresa está entre las que más se mueven de verdad. Solo lo llevan
 * los cambios estructurales a 3 meses: un bache de un mes no es noticia.
 */
export type HotSignal = {
  /** 1 = la que más se ha movido. */
  rank: number;
  /** La variable que más ha arrastrado el score en 3 meses, o `null` si no hay una clara. */
  driver: string | null;
  /** Puntos que esa variable ha sumado o restado en 3 meses. */
  driverDelta: number;
  hasCritical: boolean;
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
  /** Últimos 6 meses con trend3m, el actual incluido, para la estela del mapa. */
  trail: TrailPoint[];
  hot: HotSignal | null;
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
  /** Las que más se han movido de verdad este mes, sin filtros, por rango. */
  hot: PortfolioRow[];
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

/** Fila de la lista de grupos: el techo y la salud del holding sin abrir la ficha. */
export type GroupRow = {
  groupId: string;
  members: number;
  score: number;
  previousScore: number | null;
  estado: Estado;
  byEstado: Record<Estado, number>;
  exposure: number;
  previousExposure: number;
  eligible: number;
  interdependence: number;
  crossDefault: string[];
  /** Empresas cuya acción es noticia este mes. */
  moved: number;
  alertCount: number;
  /** Peso D1 de la empresa más grande: cuánto depende el grupo de una sola. */
  topShare: number;
};

export type GroupsResponse = {
  month: string;
  months: string[];
  groups: GroupRow[];
  totalCompanies: number;
};

export type AlertDirection = "deterioro" | "mejora";

/**
 * Una señal del mes, en cualquiera de las dos direcciones. Las de deterioro son
 * las alertas del motor; las de mejora salen de la propia decisión (sube de
 * banda o el motor amplía), porque el reto pide simetría.
 */
export type AlertItem = {
  id: string;
  company: string;
  groupId: string;
  direction: AlertDirection;
  type: string;
  label: string;
  indicator: string | null;
  onsetMonth: string;
  confirmedMonth: string;
  /** Meses entre que la señal apareció y se confirmó. */
  leadMonths: number;
  severity: "aviso" | "critica";
  score: number;
  estado: Estado;
  action: Accion;
  limit: number;
  previousLimit: number;
};

export type AlertsResponse = {
  month: string;
  months: string[];
  items: AlertItem[];
  byDirection: Record<AlertDirection, number>;
  bySeverity: Record<"aviso" | "critica", number>;
};

/** Cuánto antes avisó el motor de un cierre, medido sobre los cierres del dataset. */
export type BacktestResponse = {
  cutoff: string;
  months: string[];
  companies: number;
  /** Cierres de línea viva hasta el corte. */
  closes: number;
  /** Cierres que tenían alguna alerta previa. */
  anticipated: number;
  /** Meses de anticipación de los cierres anticipados. */
  leadTimes: { months: number; count: number }[];
  medianLead: number | null;
  /** Alertas críticas emitidas con al menos 6 meses de margen hasta el corte. */
  criticalAlerts: number;
  /** De esas, cuántas fueron seguidas de reducir o cerrar en 6 meses. */
  criticalFollowed: number;
  /** Cambios de banda por empresa y año, media. */
  bandChangesPerYear: number;
  /** Empresas que en algún mes cambiaron de acción y al siguiente volvieron. */
  flipFlops: number;
  /** Cierres y alertas por mes, para el gráfico. */
  timeline: { month: string; closes: number; anticipated: number; alerts: number }[];
};

/** Dónde queda una variable de la empresa frente al resto de la cartera ese mes. */
export type BenchmarkRow = {
  indicator: string;
  raw: number | null;
  subscore: number;
  /** 0-1: proporción de empresas con dato que puntúan peor. */
  percentile: number | null;
  medianRaw: number | null;
  /** Diferencia con la mediana en unidades del indicador. */
  gapToMedian: number | null;
};

export type BenchmarkResponse = {
  company: string;
  month: string;
  cohort: number;
  scorePercentile: number;
  rows: BenchmarkRow[];
};
