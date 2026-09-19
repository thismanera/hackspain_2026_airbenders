import type { BlockId } from "./indicators";

export type Estado = "sana" | "vigilar" | "riesgo" | "sin_datos";

/** Quién mira: Embat (todo) o el partner (solo quien ha pedido). PRODUCT §7 regla 1. */
export type Scope = "embat" | "partner";

/** Punto del cubo de pares, cada coordenada en [-1, 1]. */
export type Vec3 = readonly [number, number, number];
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

/**
 * Desglose del TAE "desde" (30 días). Cada 30 días extra suman 0,5 pp. Los cinco
 * campos son sumandos en puntos porcentuales y suman exactamente `apr`: el
 * ajuste de tendencia es negativo cuando la empresa mejora.
 */
export type AprBreakdown = {
  base: number;
  tenorPremium: number;
  confidencePremium: number;
  trendAdjustment: number;
  forecastPremium: number;
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
  aprBreakdown: AprBreakdown;
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
  /** Previsión a 3 y 6 meses (docs/forecast-engine.md). `null` si el run no la trae. */
  forecast?: Forecast | null;
};

/**
 * Qué significa la previsión en euros (PRODUCT §10: convertir el score en
 * dinero). Se compara la banda prevista a 3 meses con la de hoy y se traduce a
 * límite, TAE e intereses de un año. Positivo = la empresa gana.
 */
export type ForecastImpact = {
  bandNow: Banda;
  bandPred: Banda;
  limitNow: number;
  /** Límite que tocaría con la banda prevista; 0 si la banda prevista es D. */
  limitPred: number;
  aprNow: number | null;
  aprPred: number | null;
  /** € al año de intereses que la empresa se ahorra (+) o paga de más (−). */
  annualDelta: number;
  /** Crédito que gana (+) o pierde (−). */
  limitDelta: number;
  tone: "mejora" | "deterioro" | "igual";
};

/** Lo que las pantallas necesitan de la previsión, ya aplanado. */
export type Forecast = {
  scoreSoloPred3m: number;
  scoreGrupoPred3m: number;
  scoreSoloPred6m: number;
  scoreGrupoPred6m: number;
  p10Solo3m: number;
  p90Solo3m: number;
  p10Grupo3m: number;
  p90Grupo3m: number;
  p10Solo6m: number;
  p90Solo6m: number;
  bandaSoloPred3m: Banda;
  bandaSoloPred6m: Banda;
  direccionPred: Direccion;
  /** La serie era demasiado corta para una tendencia: la previsión repite el score. */
  sinTendencia: boolean;
  /** `desconectado` = modo sombra: la decisión de este mes no la usa (decisión 38). */
  metodoSolo: string;
  metodoGrupo: string;
  impact: ForecastImpact;
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
  /** Dónde estará en 3 meses si nada cambia, y qué le cuesta. `null` sin previsión. */
  forecast: { score3m: number; band3m: Banda; impact: ForecastImpact } | null;
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
  /** Previsión a 3 meses: cuántas cambian de banda y cuánto dinero hay en juego. */
  forecast: {
    bandUp: number;
    bandDown: number;
    /** Suma de `annualDelta`: positivo = las empresas ganan en conjunto. */
    annualDelta: number;
  };
};

/**
 * Fila tal y como viaja a la tabla y al mapa: sin el motivo (solo lo lee el CSV)
 * ni la sparkline (solo la llevan las filas de `hot`). Con ~1.300 empresas esos
 * dos campos son un tercio del payload.
 */
export type PortfolioListRow = Omit<PortfolioRow, "reason" | "spark">;

export type PortfolioResponse = {
  month: string;
  months: string[];
  summary: PortfolioSummary;
  /** Mismo filtro, mes anterior. `null` en el primer mes del calendario. */
  previous: PortfolioSummary | null;
  /** Mismo filtro, cada mes del calendario hasta el seleccionado, en orden. */
  history: PortfolioSummary[];
  rows: PortfolioListRow[];
  /** Las que más se han movido de verdad este mes, sin filtros, por rango. */
  hot: PortfolioRow[];
  /** Filas antes de aplicar filtros, para distinguir "cartera vacía" de "filtro vacío". */
  totalUnfiltered: number;
};

/** Lo que materializa `scoring:import` por mes: la misma respuesta con las filas completas. */
export type PortfolioSnapshotPayload = Omit<PortfolioResponse, "rows"> & { rows: PortfolioRow[] };

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
  /** Métricas del backtest del motor sobre los grupos de validación; null si el run no las trae. */
  engine: EngineMetrics | null;
};

/** Eventos de deterioro/recuperación frente a alertas del motor (scoring §13). */
export type EngineEventMetrics = {
  events: number;
  alerts: number;
  matched: number;
  recall: number | null;
  falseAlarmRate: number | null;
  leadMedian: number | null;
};

export type EngineScoreMetrics = {
  /** Spearman entre el score y el margen de caja futuro. */
  spearman: number | null;
  /** AUC del score frente al estrés de caja a 3 meses. */
  stressAuc: number | null;
  stressAucCi95: readonly [number, number] | null;
  monotonic: boolean | null;
  deterioro: EngineEventMetrics;
  recuperacion: EngineEventMetrics;
};

/** Lo que el propio motor midió de sí mismo al importar el run (`score_runs.metrics`). */
export type EngineMetrics = {
  window: readonly [string, string];
  validationCompanies: number;
  scoreSolo: EngineScoreMetrics;
  scoreGrupo: EngineScoreMetrics;
  decision: {
    events: number;
    avoidedExposure: number;
    simulatedRevenue: number;
    /** Fracción de empresa-mes con cambio de acción. */
    oscillation: number;
    closes: number;
    falseCloses: number;
    closeLeadMedian: number | null;
  };
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

/* ------------------------------------------------------------------ *
 * Espacio de pares (PCA de los 14 subscores, tres ejes)
 * ------------------------------------------------------------------ */

export type PeerAxis = {
  /** Fracción de la varianza que explica este eje. */
  explained: number;
  /** Los tres indicadores que más pesan en el eje, con su carga (signo incluido). */
  top: { indicator: string; loading: number }[];
};

export type PeerCluster = {
  id: number;
  /** "Cobran tarde · pocos clientes": los dos rasgos que más lo separan del resto. */
  label: string;
  size: number;
  medianScore: number | null;
  centroid: Vec3;
};

export type PeerPoint = {
  /** `null` = silueta anónima: quien mira no tiene derecho a saber quién es. */
  company: string | null;
  /** Clave estable para React aunque el punto sea anónimo. */
  key: string;
  /** Posición a cierre del mes pedido; `null` = sin datos ese mes, no se dibuja. */
  pos: Vec3 | null;
  estado: Estado;
  score: number | null;
  /** Cambio de score desde el primer mes de la estela. `null` si no hay ambos. */
  deltaTrail: number | null;
  cluster: number | null;
  /** Alineada a `months` (≤ 12, la última = `month`); `null` en los meses sin datos. */
  trail: (Vec3 | null)[];
};

export type PeerMapResponse = {
  month: string;
  /** Meses de la estela, del más antiguo al pedido. */
  months: string[];
  axes: [PeerAxis, PeerAxis, PeerAxis];
  clusters: PeerCluster[];
  points: PeerPoint[];
  /** Empresa que consulta (scope empresa), o `null`. */
  focus: string | null;
};
