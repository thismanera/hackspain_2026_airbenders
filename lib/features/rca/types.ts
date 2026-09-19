export type TipoDecision = "acierto_mitigante" | "error_agravante";
export type CanalRca = "operativo" | "financiero" | "comercial" | "holding";

export type DecisionPostInflexion = {
  variable: string;
  canal: CanalRca;
  tipo: TipoDecision;
  /** Cambio de aportación entre el origen de la inflexión y el mes analizado. */
  deltaPuntos: number;
  /** Evidencia observada en el scoring; no atribuye causalidad ni una decisión de gestión. */
  descripcion: string;
  leccionAprendida: string;
  accionRecomendada: string;
};

export type DiagnosticoRespuesta =
  "reaccion_resiliente" | "reaccion_destructiva" | "reaccion_pasiva" | "en_recuperacion";

export type PlaybookEstrategico = {
  mantener: string[];
  evitar: string[];
  accionesInmediatas: string[];
};

export type ContextoHolding = {
  /** Cambio de la aportación efectiva del holding, separado del score autónomo. */
  deltaPuntos: number;
  observacion: DecisionPostInflexion | null;
};

export type AnalisisPostInflexion = {
  company: string;
  mesActual: string;
  mesInflexion: string;
  mesesTranscurridos: number;
  scoreEnInflexion: number;
  scoreActual: number;
  deltaScoreTotal: number;
  /** Escenario contable si las pérdidas autónomas seleccionadas vuelven al origen. */
  scoreRecuperableEstimado: number;
  tipoInflexion: "pico_bajista" | "suelo_alcista";
  detonanteOriginal: {
    id: string;
    canal: string;
    descripcion: string;
  };
  /** Hallazgos seleccionados; no constituyen una descomposición exhaustiva de deltaScoreTotal. */
  aciertos: DecisionPostInflexion[];
  /** Hallazgos seleccionados; no constituyen una descomposición exhaustiva de deltaScoreTotal. */
  errores: DecisionPostInflexion[];
  diagnosticoRespuesta: DiagnosticoRespuesta;
  playbook: PlaybookEstrategico;
  contextoHolding: ContextoHolding;
};
