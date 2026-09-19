import type { VariableId } from "@/lib/features/scoring/params";

export type Company = { id: string; groupId: string; currency: string };
export type Product = { company: string; type: string; currency: string; service: string };

/** Movimiento bancario ya filtrado (booked, en ventana) con importe en € o null si no convertible. */
export type Tx = {
  id: string;
  company: string;
  product: string;
  date: string;
  month: string;
  amount: number | null;
  category: string;
  counterparty: string;
};

/** Factura `invoice` con importe en € y signo (+ cliente, − proveedor). */
export type Invoice = {
  id: string;
  company: string;
  issued: string;
  due: string;
  paid: string;
  amount: number;
  status: string;
  counterparty: string;
};

export const OBLIGACIONES = ["tax", "social_security", "salary", "debt_repayment"] as const;
export type Obligacion = (typeof OBLIGACIONES)[number];

export type Flow = {
  company: string;
  month: string;
  observed: boolean;
  cobrosOp: number;
  pagosOp: number;
  servicioDeuda: number;
  dispCredito: number;
  amortCredito: number;
  recibosDevueltos: number;
  obligaciones: Record<Obligacion, number>;
  intragrupoIn: number;
  intragrupoOut: number;
  clasificado: number;
  neutral: number;
  sinClasificar: number;
  /** Importe € de los movimientos excluidos por producto desconocido o no operativo. */
  excluido: number;
  nMov: number;
  /** Movimientos sin importe convertible a € (amount null): no entran en ningún importe. */
  nSinImporte: number;
  cobrosPorContraparte: Record<string, number>;
  pagosPorContraparte: Record<string, number>;
};

export type GroupFlow = {
  month: string;
  cobrosOp: number;
  pagosOp: number;
  servicioDeuda: number;
  nEmpresas: number;
};

export type VariableValue = { raw: number | null; conf: number };
export type VariableSet = Record<VariableId, VariableValue>;

export type Extras = {
  cobrosOpMedia3m: number;
  cobrosOpMedia6m: number;
  pagosOpMedia6m: number;
  servicioDeudaMedia6m: number;
  amortCreditoMedia6m: number;
  obligacionesRecMedia6m: number;
  capacidadCuotaAdv: number;
  cobrosOp12m: number;
  pagosOp12m: number;
  intragrupoIn12m: number;
  intragrupoOut12m: number;
  rachaB2: number;
  rachaB2Prev: number[];
  rachaDeficit: number;
  C3dias: number | null;
  C4: number | null;
  deficitMes: boolean | null;
  margenMes: number | null;
  cobertura: {
    mesesObs6m: number;
    mesesObs12m: number;
    pctClasificado6m: number;
    nFacturasCli6m: number;
    nFacturasProv6m: number;
    tieneLineaCredito: boolean;
    tieneCuotas: boolean;
    C4Estimado: boolean;
    /** Suma 6m del importe € excluido por producto desconocido o no operativo (§10). */
    importesExcluidosEur: number;
  };
};

export type Contribution = {
  id: VariableId;
  raw: number | null;
  subnota: number | null;
  conf: number;
  peso: number;
  pesoEfectivo: number;
  aportacion: number;
  umbralSano: number | null;
  sano: boolean | null;
  aplicable: boolean;
};

export type AlertTipo =
  | "deterioro"
  | "deterioro_estructural"
  | "recuperacion"
  | "deficit_persistente"
  | "impago_obligaciones"
  | "vencido_alto"
  | "contagio_grupo"
  | "datos_insuficientes"
  | "alerta_temprana_deterioro";
export type Alert = { tipo: AlertTipo; desdeMes: string };
export type Direccion = "mejora" | "estable" | "deterioro";
export type Naturaleza = "temporal" | "estructural" | "sin_cambio";
export type PatronTrayectoria =
  "bache_puntual" | "caida_estructural" | "inestabilidad_cronica" | "estable" | "mejora";
export type Estado = "sana" | "vigilar" | "riesgo" | "sin_datos";
export type PerfilGrupo = "filial_subvencionada" | "drenaje_tesoreria" | "estandar";
export type FactorDeterminante = { id: string; delta: number; descripcion: string };
export type CanalDesencadenante = "comercial" | "operativo" | "financiero" | "holding" | "ninguno";
export type InflexionResult = {
  hayInflexion: boolean;
  tipo: "pico_bajista" | "suelo_alcista" | "sin_inflexion";
  mesInflexion: string | null;
  antelacionMeses: number;
  scoreInflexion: number | null;
  canalDesencadenante: CanalDesencadenante;
  variableDetonante: string | null;
  explicacion: string;
};
export type DiagnosticoMejora = { confirmada: boolean; motor: string | null };

/** p5/p95 congelados por variable; null cuando no hubo muestras fiables (subnota neutral 50). */
export type Percentiles = Record<VariableId, { p5: number | null; p95: number | null }>;
export type Parameters = {
  version: string;
  paramsHash: string;
  percentiles: Percentiles;
  trainGroups: string[];
  validationGroups: string[];
  inputFingerprint: string;
  /** Percentil congelado de C5 para clasificar inestabilidad crónica. */
  c5P80: number | null;
};

export type Senales = {
  deterioro: boolean;
  estructural: boolean;
  mejora: boolean;
  deficit: boolean;
  impago: boolean;
  vencidoAlto: boolean;
  contagio: boolean;
  datosInsuficientes: boolean;
  alertaTempranaDeterioro: boolean;
};

/** Contrato scoring-engine §10. */
export type ScoreRow = {
  company: string;
  month: string;
  groupId: string;
  versionParametros: string;
  scoreSolo: number;
  ajusteHolding: number;
  aportacionGrupo: number;
  deltaGrupo: number;
  confianza: number;
  subscores: Record<"A" | "B" | "C", number>;
  confs: Record<"A" | "B" | "C", number>;
  estadoSolo: Estado;
  estadoGrupo: Estado;
  perfilGrupo: PerfilGrupo;
  variables: Contribution[];
  deltaContrib: { id: VariableId; delta: number }[];
  direccion: Direccion;
  naturaleza: Naturaleza;
  patronTrayectoria: PatronTrayectoria;
  tendScore3m: number | null;
  tendScore6m: number | null;
  tendScore12m: number | null;
  tend3m: Record<"A" | "B" | "C", number | null>;
  alertaTempranaDeterioro: boolean;
  factorDeterminante: FactorDeterminante;
  factorDeterminanteGrupo: FactorDeterminante;
  canarioEnMina: { detectado: boolean; id: string | null; mensaje: string | null };
  diagnosticoMejora: DiagnosticoMejora;
  inflexion: InflexionResult;
  inflexionGrupo: InflexionResult;
  rachaB2: number;
  rachaDeficit: number;
  C3dias: number | null;
  C4: number | null;
  cobrosOpMedia3m: number;
  cobrosOpMedia6m: number;
  pagosOpMedia6m: number;
  servicioDeudaMedia6m: number;
  amortCreditoMedia6m: number;
  obligacionesRecMedia6m: number;
  capacidadCuotaAdv: number;
  D1: number;
  D2: number | null;
  D3: number | null;
  D4: number | null;
  D5: number;
  confD: number;
  tienePrestamoIntragrupo: boolean;
  cobrosOpGrupoMedia6m: number;
  pagosOpGrupoMedia6m: number;
  servicioDeudaGrupoMedia6m: number;
  /** Nota autónoma ajustada por apoyo/contagio del holding. */
  scoreGrupo: number;
  deficitMes: boolean | null;
  margenMes: number | null;
  senales: Senales;
  alertas: Alert[];
  cobertura: Extras["cobertura"] & { nHermanasConDatos: number };
};
