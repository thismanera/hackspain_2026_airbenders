import { analisisPostInflexionSchema } from "@/lib/features/rca/contracts";
import type {
  AnalisisPostInflexion,
  CanalRca,
  DecisionPostInflexion,
  DiagnosticoRespuesta,
  ProductoSugerido,
} from "@/lib/features/rca/types";
import { VARIABLES, type VariableId } from "@/lib/features/scoring/params";
import type { Contribution, ScoreRow } from "@/lib/features/scoring/types";

const UMBRAL_HOLDING = 2;
const EPSILON = 1e-9;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const RCA_VARIABLES = [
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "B1",
  "B2",
  "B3",
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
] as const;
type RcaVariable = (typeof RCA_VARIABLES)[number];

type DecisionMetadata = {
  acierto: string;
  error: string;
  leccionAcierto: string;
  leccionError: string;
  accionAcierto: string;
  accionError: string;
  canal: CanalRca;
};

const DICCIONARIO_DECISIONES = {
  A1: {
    acierto: "Mejora observada del margen de caja operativo",
    error: "Deterioro observado del margen de caja operativo",
    leccionAcierto: "La mejora del margen aporta más capacidad para absorber tensiones de caja",
    leccionError: "La pérdida de margen reduce el colchón disponible ante pagos imprevistos",
    accionAcierto: "Mantener la revisión semanal de cobros, pagos y gastos no esenciales",
    accionError: "Revisar las partidas de gasto operativo y renegociar costes de estructura",
    canal: "operativo",
  },
  A2: {
    acierto: "Reducción observada de los meses en déficit de caja",
    error: "Aumento observado de los meses en déficit de caja",
    leccionAcierto: "Una racha de caja positiva aporta margen para atender obligaciones próximas",
    leccionError: "Los meses en déficit consumen el colchón operativo disponible",
    accionAcierto: "Mantener una previsión semanal de caja con cobros y pagos comprometidos",
    accionError:
      "Revisar gastos, cobros pendientes y calendario de pagos para cortar la racha de déficit",
    canal: "operativo",
  },
  A3: {
    acierto: "Mejora observada de la cobertura del servicio de deuda",
    error: "Deterioro observado de la cobertura del servicio de deuda",
    leccionAcierto: "Una cobertura mayor reduce la presión de las obligaciones financieras",
    leccionError: "Una cobertura insuficiente deja menos margen para atender la deuda",
    accionAcierto: "Mantener el seguimiento de la cobertura y de los vencimientos de deuda",
    accionError:
      "Revisar vencimientos y valorar una reestructuración antes de agotar la caja operativa",
    canal: "financiero",
  },
  A4: {
    acierto: "Reducción observada de la carga de cuotas sobre la caja",
    error: "Aumento observado de la carga de cuotas sobre la caja",
    leccionAcierto: "Una carga menor conserva capacidad para financiar el ciclo operativo",
    leccionError: "Una carga elevada limita la capacidad de absorber desfases de cobro",
    accionAcierto: "Conservar el calendario de amortización compatible con la caja disponible",
    accionError:
      "Solicitar revisión de cuotas o carencia antes de retrasar obligaciones operativas",
    canal: "financiero",
  },
  A5: {
    acierto: "Mejora observada en el uso de la línea de crédito",
    error: "Deterioro observado en la dependencia de la línea de crédito",
    leccionAcierto: "Una mayor holgura de línea conserva liquidez disponible para picos temporales",
    leccionError: "Una disposición elevada y sostenida reduce el margen financiero de emergencia",
    accionAcierto: "Conservar la holgura disponible y revisar mensualmente el saldo utilizado",
    accionError: "Preparar un calendario realista de reducción del saldo dispuesto",
    canal: "financiero",
  },
  B1: {
    acierto: "Mejora observada del cumplimiento de nóminas, tributos y deuda",
    error: "Deterioro observado del cumplimiento de nóminas, tributos y deuda",
    leccionAcierto: "La regularidad de las obligaciones críticas protege la continuidad operativa",
    leccionError: "Los retrasos en obligaciones críticas elevan la presión financiera",
    accionAcierto: "Mantener una reserva específica para nóminas, tributos y deuda",
    accionError:
      "Regularizar las obligaciones pendientes y acordar un calendario verificable de pago",
    canal: "financiero",
  },
  B2: {
    acierto: "Mejora observada en el cumplimiento de obligaciones recurrentes",
    error: "Deterioro observado en el cumplimiento de obligaciones recurrentes",
    leccionAcierto:
      "La continuidad en pagos laborales y tributarios protege la capacidad operativa",
    leccionError: "Los retrasos en obligaciones críticas elevan el riesgo financiero y operativo",
    accionAcierto: "Mantener la priorización de nóminas, Seguridad Social y tributos",
    accionError:
      "Revisar y regularizar de inmediato las obligaciones laborales o tributarias pendientes",
    canal: "financiero",
  },
  B3: {
    acierto: "Mejora observada en la puntualidad de pago a proveedores",
    error: "Aumento observado del retraso en pagos a proveedores",
    leccionAcierto:
      "La puntualidad ayuda a conservar el crédito comercial y la continuidad de suministro",
    leccionError:
      "El aumento de retrasos puede deteriorar las condiciones ofrecidas por proveedores",
    accionAcierto: "Usar la puntualidad observada para revisar condiciones con proveedores clave",
    accionError:
      "Utilizar confirming o acuerdos de aplazamiento antes de demorar pagos unilateralmente",
    canal: "financiero",
  },
  C1: {
    acierto: "Reducción observada de la concentración de clientes",
    error: "Aumento observado de la concentración de clientes",
    leccionAcierto: "Una cartera de clientes más diversificada reduce la dependencia comercial",
    leccionError:
      "La concentración de clientes aumenta la exposición a una sola relación comercial",
    accionAcierto: "Mantener límites de exposición y seguimiento por cliente",
    accionError: "Revisar límites de cliente y priorizar la diversificación de la cartera",
    canal: "comercial",
  },
  C2: {
    acierto: "Reducción observada de la concentración de proveedores",
    error: "Aumento observado de la concentración de proveedores",
    leccionAcierto: "Una red de proveedores más diversificada reduce la dependencia de suministro",
    leccionError:
      "La concentración de proveedores aumenta la exposición a interrupciones de suministro",
    accionAcierto: "Mantener alternativas activas para los proveedores críticos",
    accionError: "Revisar alternativas de suministro y acuerdos con proveedores clave",
    canal: "comercial",
  },
  C4: {
    acierto: "Reducción observada del peso de facturas vencidas sin cobrar",
    error: "Aumento observado del peso de facturas vencidas sin cobrar",
    leccionAcierto: "Reducir vencidos libera caja y limita la exposición a clientes morosos",
    leccionError: "La acumulación de vencidos prolonga el desfase de tesorería",
    accionAcierto: "Mantener el seguimiento temprano de vencimientos y reclamaciones",
    accionError: "Revisar límites de cliente y valorar anticipo de las facturas elegibles",
    canal: "comercial",
  },
  C5: {
    acierto: "Reducción observada de la volatilidad de cobros",
    error: "Aumento observado de la volatilidad de cobros",
    leccionAcierto: "Una entrada de caja más predecible facilita la planificación operativa",
    leccionError: "La volatilidad de cobros dificulta anticipar la caja disponible",
    accionAcierto: "Mantener previsiones de cobro y seguimiento de desviaciones",
    accionError: "Revisar el calendario de cobros y reservar caja para meses irregulares",
    canal: "comercial",
  },
  C3: {
    acierto: "Reducción observada del retraso mediano en el cobro de clientes",
    error: "Aumento observado del retraso mediano en el cobro de clientes",
    leccionAcierto: "Cobrar antes reduce el desfase entre pagos y cobros",
    leccionError: "Cobrar más tarde prolonga la necesidad de financiar el circulante",
    accionAcierto: "Mantener el seguimiento de vencimientos y condiciones de cobro",
    accionError: "Revisar condiciones comerciales y priorizar la reclamación de saldos vencidos",
    canal: "comercial",
  },
  C6: {
    acierto: "Reducción observada de recibos devueltos por clientes",
    error: "Aumento observado de recibos devueltos por clientes",
    leccionAcierto: "La reducción de devoluciones mejora la previsibilidad de los cobros",
    leccionError: "Las nuevas devoluciones pueden anticipar un deterioro de la calidad de cobro",
    accionAcierto: "Mantener la revisión de clientes con antecedentes de devolución",
    accionError:
      "Contactar con los clientes afectados y revisar el medio y las condiciones de pago",
    canal: "comercial",
  },
  holding: {
    acierto: "Aumento observado del apoyo neto aportado por el holding",
    error: "Deterioro observado de la aportación neta del holding",
    leccionAcierto: "El apoyo del grupo ha mejorado el contexto financiero de la filial",
    leccionError:
      "La menor cobertura del grupo o el drenaje de caja aumenta la exposición de la filial",
    accionAcierto: "Documentar el apoyo intragrupo y su calendario de devolución",
    accionError: "Revisar los barridos de caja y definir un saldo operativo mínimo para la filial",
    canal: "holding",
  },
} as const satisfies Readonly<Record<RcaVariable | "holding", DecisionMetadata>>;

const PRODUCTOS_SUGERIDOS = {
  A1: "ninguno",
  A2: "ninguno",
  A3: "reestructuracion_deuda",
  A4: "reestructuracion_deuda",
  A5: "reestructuracion_deuda",
  B1: "ninguno",
  B2: "ninguno",
  B3: "embat_confirming",
  C1: "ninguno",
  C2: "ninguno",
  C3: "embat_factoring",
  C4: "embat_factoring",
  C5: "ninguno",
  C6: "gestion_cobros",
  holding: "cortafuegos_holding",
} as const satisfies Readonly<Record<RcaVariable | "holding", ProductoSugerido>>;

type Finding = {
  decision: DecisionPostInflexion;
  rawDelta: number;
  order: number;
};

function monthNumber(month: string): number {
  if (!MONTH_PATTERN.test(month)) throw new Error(`RCA: mes inválido (${month})`);
  const [year, value] = month.split("-").map(Number);
  return year * 12 + value - 1;
}

function rounded(value: number): number {
  // Los pesos bajos pueden producir impactos positivos de unas centésimas
  // (por ejemplo C2). Conservamos tres decimales para no convertir un acierto
  // material por subnota en cero y violar el signo del contrato Zod.
  const result = Math.round(value * 1000) / 1000;
  if (result === 0 && value !== 0) return value;
  return Object.is(result, -0) ? 0 : result;
}

function contributionAt(row: ScoreRow, id: VariableId): Contribution | undefined {
  return row.variables.find((variable) => variable.id === id);
}

function hasComparableEvidence(rows: ScoreRow[], id: RcaVariable): boolean {
  const contributions = rows.map((row) => contributionAt(row, id));
  if (
    contributions.some(
      (item) =>
        item === undefined ||
        !item.aplicable ||
        item.raw === null ||
        !Number.isFinite(item.raw) ||
        item.subnota === null ||
        !Number.isFinite(item.subnota) ||
        !Number.isFinite(item.aportacion) ||
        !Number.isFinite(item.pesoEfectivo),
    )
  )
    return false;
  const weight = contributions[0]!.pesoEfectivo;
  return contributions.every((item) => Math.abs(item!.pesoEfectivo - weight) <= EPSILON);
}

function finding(id: RcaVariable, origin: Contribution, destination: Contribution): Finding | null {
  const meta = DICCIONARIO_DECISIONES[id];
  const order = VARIABLES.indexOf(id);
  const delta = destination.aportacion - origin.aportacion;
  const deltaSubnota = destination.subnota! - origin.subnota!;
  const threshold = Math.max(0.3, 1.5 * (destination.pesoEfectivo / 0.1));
  const material = Math.abs(delta) >= threshold || Math.abs(deltaSubnota) >= 25;
  if (material && delta > EPSILON)
    return {
      rawDelta: delta,
      order,
      decision: {
        variable: id,
        canal: meta.canal,
        tipo: "acierto_mitigante",
        productoSugerido: PRODUCTOS_SUGERIDOS[id],
        deltaPuntos: rounded(delta),
        descripcion: meta.acierto,
        leccionAprendida: meta.leccionAcierto,
        accionRecomendada: meta.accionAcierto,
      },
    };
  if (material && delta < -EPSILON)
    return {
      rawDelta: delta,
      order,
      decision: {
        variable: id,
        canal: meta.canal,
        tipo: "error_agravante",
        productoSugerido: PRODUCTOS_SUGERIDOS[id],
        deltaPuntos: rounded(delta),
        descripcion: meta.error,
        leccionAprendida: meta.leccionError,
        accionRecomendada: meta.accionError,
      },
    };
  return null;
}

function holdingContext(delta: number): AnalisisPostInflexion["contextoHolding"] {
  const deltaPuntos = rounded(delta);
  const meta = DICCIONARIO_DECISIONES.holding;
  if (delta >= UMBRAL_HOLDING)
    return {
      deltaPuntos,
      observacion: {
        variable: "holding",
        canal: "holding",
        tipo: "acierto_mitigante",
        productoSugerido: PRODUCTOS_SUGERIDOS.holding,
        deltaPuntos,
        descripcion: meta.acierto,
        leccionAprendida: meta.leccionAcierto,
        accionRecomendada: meta.accionAcierto,
      },
    };
  if (delta <= -UMBRAL_HOLDING)
    return {
      deltaPuntos,
      observacion: {
        variable: "holding",
        canal: "holding",
        tipo: "error_agravante",
        productoSugerido: PRODUCTOS_SUGERIDOS.holding,
        deltaPuntos,
        descripcion: meta.error,
        leccionAprendida: meta.leccionError,
        accionRecomendada: meta.accionError,
      },
    };
  return { deltaPuntos, observacion: null };
}

function diagnosis(
  type: "pico_bajista" | "suelo_alcista",
  aciertos: Finding[],
  errores: Finding[],
): DiagnosticoRespuesta {
  if (type === "suelo_alcista") return "en_recuperacion";
  const balance = [...aciertos, ...errores].reduce((total, item) => total + item.rawDelta, 0);
  if (balance > EPSILON) return "reaccion_resiliente";
  if (balance < -EPSILON) return "reaccion_destructiva";
  return "reaccion_pasiva";
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

/** Analiza evidencia observada desde una inflexión autónoma hasta el mes solicitado. */
export function analizarReaccionPostInflexion(
  companyRows: ScoreRow[],
  targetMonth?: string,
): AnalisisPostInflexion | null {
  if (!companyRows.length) return null;
  const companies = new Set(companyRows.map((row) => row.company));
  if (companies.size !== 1) throw new Error("RCA: todas las filas deben pertenecer a una empresa");

  const seen = new Set<string>();
  for (const row of companyRows) {
    monthNumber(row.month);
    if (seen.has(row.month)) throw new Error(`RCA: mes duplicado (${row.month})`);
    seen.add(row.month);
  }
  if (targetMonth !== undefined) monthNumber(targetMonth);

  const rows = [...companyRows].sort((a, b) => monthNumber(a.month) - monthNumber(b.month));
  const current = targetMonth ? rows.find((row) => row.month === targetMonth) : rows.at(-1);
  if (!current) return null;
  const inflexion = current.inflexion;
  if (
    !inflexion.hayInflexion ||
    inflexion.mesInflexion === null ||
    inflexion.tipo === "sin_inflexion"
  )
    return null;

  const inflexionMonth = monthNumber(inflexion.mesInflexion);
  const start = rows.find((row) => row.month === inflexion.mesInflexion);
  if (!start) return null;
  const startMonth = monthNumber(start.month);
  if (startMonth !== inflexionMonth) return null;
  const currentMonth = monthNumber(current.month);
  const elapsed = currentMonth - startMonth;
  if (elapsed < 2) return null;

  const period = rows.filter((row) => {
    const month = monthNumber(row.month);
    return month >= startMonth && month <= currentMonth;
  });
  if (
    period.length !== elapsed + 1 ||
    period.some((row, index) => monthNumber(row.month) !== startMonth + index)
  )
    return null;
  if (new Set(period.map((row) => row.versionParametros)).size !== 1)
    throw new Error("RCA: versiones de scoring incompatibles en el período analizado");

  const findings = RCA_VARIABLES.flatMap((id) => {
    if (!hasComparableEvidence(period, id)) return [];
    const origin = contributionAt(start, id)!;
    const destination = contributionAt(current, id)!;
    const result = finding(id, origin, destination);
    return result ? [result] : [];
  });
  const sortByImpact = (a: Finding, b: Finding) =>
    Math.abs(b.rawDelta) - Math.abs(a.rawDelta) || a.order - b.order;
  const aciertos = findings
    .filter((item) => item.decision.tipo === "acierto_mitigante")
    .sort(sortByImpact);
  const errores = findings
    .filter((item) => item.decision.tipo === "error_agravante")
    .sort(sortByImpact);
  if (!Number.isFinite(start.aportacionGrupo) || !Number.isFinite(current.aportacionGrupo))
    throw new Error("RCA: aportación de holding no finita");
  const scoreRecuperableEstimado = Math.min(
    100,
    rounded(
      current.scoreSolo + errores.reduce((total, item) => total + Math.abs(item.rawDelta), 0),
    ),
  );
  const drenajeHolding = Math.max(0, -current.aportacionGrupo);

  const result: AnalisisPostInflexion = {
    company: current.company,
    mesActual: current.month,
    mesInflexion: start.month,
    mesesTranscurridos: elapsed,
    scoreEnInflexion: start.scoreSolo,
    scoreActual: current.scoreSolo,
    deltaScoreTotal: rounded(current.scoreSolo - start.scoreSolo),
    scoreRecuperableEstimado,
    scoreRecuperableGrupoEstimado: Math.min(
      100,
      rounded(scoreRecuperableEstimado + drenajeHolding),
    ),
    tipoInflexion: inflexion.tipo,
    detonanteOriginal: {
      id: inflexion.variableDetonante ?? "desconocido",
      canal: inflexion.canalDesencadenante,
      descripcion: inflexion.explicacion,
    },
    aciertos: aciertos.map((item) => item.decision),
    errores: errores.map((item) => item.decision),
    diagnosticoRespuesta: diagnosis(inflexion.tipo, aciertos, errores),
    playbook: {
      mantener: aciertos.map(
        ({ decision }) => `${decision.leccionAprendida} (+${decision.deltaPuntos} pts observados).`,
      ),
      evitar: errores.map(
        ({ decision }) => `${decision.leccionAprendida} (${decision.deltaPuntos} pts observados).`,
      ),
      accionesInmediatas: unique([
        ...errores.map(({ decision }) => decision.accionRecomendada),
        ...aciertos.slice(0, 1).map(({ decision }) => decision.accionRecomendada),
      ]),
    },
    contextoHolding: holdingContext(current.aportacionGrupo - start.aportacionGrupo),
  };
  return analisisPostInflexionSchema.parse(result);
}
