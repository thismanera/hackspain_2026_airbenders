/**
 * Datos de demostración para el panel.
 *
 * Los metadatos de empresa y grupo son reales (`companies.seed.ts`, extraído de
 * `dataset/companies.csv`); los scores son sintéticos. Lo que NO es sintético es
 * la aritmética: este módulo implementa de verdad la agregación de SOURCE §1.5,
 * el ajuste de grupo de §1.7 y las puertas, el límite, el plazo y el precio de
 * §2. Por eso la cascada suma exactamente el score, y el límite se deduce de la
 * capacidad de cuota que se enseña al lado. Un panel cuyos números no cuadran
 * entre sí no se puede defender delante de nadie.
 *
 * Todo se genera de forma determinista a partir del id de la empresa: la misma
 * empresa da siempre el mismo score, refresco tras refresco.
 */
import { CALENDAR } from "./calendar";
import { COMPANY_SEED } from "./companies.seed";
import { BLOCKS, INDICATORS, type BlockId } from "./indicators";
import type {
  Accion,
  Alert,
  CompanyMeta,
  Contribution,
  Coverage,
  Decision,
  Gate,
  GroupAdjustment,
  MonthScore,
  TenorOption,
} from "./types";
import { BANDA, deriveBanda, deriveDireccion, deriveEstado } from "./vocabulary";

/* ------------------------------------------------------------------ *
 * Aleatoriedad determinista
 * ------------------------------------------------------------------ */

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: pequeño, rápido y reproducible entre ejecuciones. */
function rng(seed: string): () => number {
  let state = hash(seed);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/* ------------------------------------------------------------------ *
 * Escalas congeladas (SOURCE §1.0: p5/p95 versionados, no se recalculan)
 * ------------------------------------------------------------------ */

const SCALE: Record<string, { p5: number; p95: number }> = {
  A1: { p5: -0.15, p95: 0.45 },
  A2: { p5: 0, p95: 0.67 },
  A3: { p5: 0.2, p95: 4 },
  A4: { p5: 0.02, p95: 0.55 },
  A5: { p5: 0, p95: 0.6 },
  B1: { p5: 0.6, p95: 1 },
  B2: { p5: 0, p95: 4 },
  B3: { p5: -8, p95: 35 },
  C1: { p5: 0.15, p95: 0.9 },
  C2: { p5: 0.12, p95: 0.85 },
  C3: { p5: -5, p95: 45 },
  C4: { p5: 0, p95: 0.55 },
  C5: { p5: 0.08, p95: 0.8 },
  C6: { p5: 0, p95: 0.12 },
};

/** Escala 0-100, invertida cuando la variable es "mejor bajo". */
function subscoreOf(id: string, raw: number, betterWhen: "alto" | "bajo"): number {
  const { p5, p95 } = SCALE[id];
  const position = clamp((raw - p5) / (p95 - p5), 0, 1);
  return round((betterWhen === "alto" ? position : 1 - position) * 100, 1);
}

/* ------------------------------------------------------------------ *
 * Perfil de empresa
 * ------------------------------------------------------------------ */

type Archetype =
  | "solida"
  | "estacional"
  | "deterioro_estructural"
  | "recuperacion"
  | "historia_corta"
  | "estresada";

type Profile = {
  archetype: Archetype;
  /** Salud latente por mes, 0-1. Todas las variables cuelgan de aquí. */
  health: number[];
  monthlyRevenue: number;
  hasDebt: boolean;
  hasInvoices: boolean;
  hasCreditLine: boolean;
  /** Primer mes con movimientos. Antes de eso no hay historia. */
  firstMonth: number;
  classifiedShare: number;
};

const ARCHETYPES: { archetype: Archetype; weight: number }[] = [
  { archetype: "solida", weight: 0.3 },
  { archetype: "estacional", weight: 0.2 },
  { archetype: "deterioro_estructural", weight: 0.16 },
  { archetype: "recuperacion", weight: 0.14 },
  { archetype: "estresada", weight: 0.12 },
  { archetype: "historia_corta", weight: 0.08 },
];

function pickArchetype(random: () => number): Archetype {
  const roll = random();
  let cumulative = 0;
  for (const entry of ARCHETYPES) {
    cumulative += entry.weight;
    if (roll <= cumulative) return entry.archetype;
  }
  return "solida";
}

function buildProfile(companyId: string): Profile {
  const random = rng(`${companyId}:profile`);
  const archetype = pickArchetype(random);

  // Nivel base de salud y hacia dónde se mueve a lo largo de los 24 meses.
  const base = {
    solida: 0.78,
    estacional: 0.66,
    deterioro_estructural: 0.74,
    recuperacion: 0.4,
    historia_corta: 0.6,
    estresada: 0.33,
  }[archetype];

  const drift = {
    solida: 0.02,
    estacional: 0,
    deterioro_estructural: -0.42,
    recuperacion: 0.34,
    historia_corta: 0.04,
    estresada: -0.08,
  }[archetype];

  // El deterioro estructural no es lineal: se rompe a partir de un mes concreto,
  // que es justo lo que la alerta tiene que anticipar.
  const breakAt = 10 + Math.floor(random() * 6);

  const health: number[] = [];
  let wander = 0;
  for (let t = 0; t < CALENDAR.length; t++) {
    wander = wander * 0.7 + (random() - 0.5) * 0.06;
    const progress = t / (CALENDAR.length - 1);
    let value = base + wander;

    if (archetype === "deterioro_estructural") {
      value +=
        t < breakAt ? 0.01 * progress : drift * ((t - breakAt) / (CALENDAR.length - breakAt));
    } else if (archetype === "estacional") {
      value += Math.sin((t / 12) * Math.PI * 2) * 0.13;
    } else {
      value += drift * progress;
    }

    health.push(clamp(value, 0.04, 0.97));
  }

  const revenueRoll = random();
  const monthlyRevenue = Math.round((90_000 + revenueRoll ** 3 * 3_400_000) / 1000) * 1000;

  return {
    archetype,
    health,
    monthlyRevenue,
    // Cobertura calcada de la realidad del dataset: 524/1286 con cuotas visibles,
    // 1093/1286 con facturas (SOURCE §1.2 y §1.4).
    hasDebt: random() < 0.41,
    hasInvoices: random() < 0.85,
    hasCreditLine: random() < 0.32,
    // Empresas recién incorporadas: llegan al último mes con dos a cinco meses de
    // historia, que es justo el tramo donde el panel debe decir "sin datos" en
    // lugar de inventarse una opinión.
    firstMonth: archetype === "historia_corta" ? 20 + Math.floor(random() * 4) : 0,
    classifiedShare: round(0.72 + random() * 0.27, 3),
  };
}

/* ------------------------------------------------------------------ *
 * Variables del mes
 * ------------------------------------------------------------------ */

type RawVariables = Record<string, number | null>;

function rawVariablesAt(companyId: string, profile: Profile, t: number): RawVariables {
  const random = rng(`${companyId}:vars:${t}`);
  const h = profile.health[t];
  const jitter = (spread: number) => (random() - 0.5) * spread;

  const deficitStress = clamp(1 - h, 0, 1);

  const values: RawVariables = {
    // El escenario adverso de SOURCE §2.1 (cobros −20 %, pagos +10 %, cobertura
    // 1,3) solo deja capacidad por encima de ~27 % de margen, así que el rango
    // llega hasta el 45 %: si no, ninguna empresa de la cartera prestaría nunca.
    A1: round(0.02 + h * 0.5 + jitter(0.05), 4),
    A2: round(clamp(deficitStress * 0.75 + jitter(0.12), 0, 1) * (1 / 1), 4),
    A3: profile.hasDebt ? round(clamp(0.15 + h * 4.1 + jitter(0.5), 0.05, 6), 3) : null,
    A4: profile.hasDebt ? round(clamp(0.5 - h * 0.42 + jitter(0.07), 0.01, 0.9), 4) : null,
    A5: profile.hasCreditLine ? round(clamp(0.55 - h * 0.5 + jitter(0.08), 0, 0.95), 4) : null,
    B1: round(clamp(0.64 + h * 0.37 + jitter(0.06), 0.3, 1), 4),
    B2: Math.max(0, Math.round((1 - h) * 3.4 - 0.9 + jitter(0.9))),
    B3: profile.hasInvoices ? Math.round(-6 + (1 - h) * 44 + jitter(9)) : null,
    C1: round(clamp(0.2 + (1 - h) * 0.55 + jitter(0.16), 0.08, 0.98), 4),
    C2: round(clamp(0.18 + (1 - h) * 0.48 + jitter(0.15), 0.06, 0.95), 4),
    C3: profile.hasInvoices ? Math.round(-3 + (1 - h) * 52 + jitter(11)) : null,
    C4: profile.hasInvoices ? round(clamp((1 - h) * 0.6 + jitter(0.09), 0, 0.85), 4) : null,
    C5: round(clamp(0.1 + (1 - h) * 0.62 + jitter(0.12), 0.03, 1.1), 4),
    C6: round(clamp((1 - h) * 0.11 + jitter(0.02), 0, 0.25), 4),
  };

  // A2 es "proporción de los últimos 6 meses en déficit": vive en sextos.
  values.A2 = round(Math.round((values.A2 as number) * 6) / 6, 4);

  return values;
}

/** Ventana observada de 6 meses, recortada por el arranque de la empresa. */
function observedMonths(profile: Profile, t: number): number {
  return clamp(t - profile.firstMonth + 1, 0, 6);
}

function confidenceOf(profile: Profile, t: number, raw: number | null): number {
  if (raw === null) return 0;
  const window = observedMonths(profile, t) / 6;
  return round(clamp(window * profile.classifiedShare, 0, 1), 3);
}

/* ------------------------------------------------------------------ *
 * Score en solitario (SOURCE §1.5)
 * ------------------------------------------------------------------ */

type StandaloneMonth = {
  month: string;
  standaloneScore: number;
  confidence: number;
  blocks: Record<BlockId, number>;
  contributions: Omit<Contribution, "delta">[];
  coverage: Coverage;
  raw: RawVariables;
  delayStreak: number;
  deficitStreak: number;
  revenue: number;
};

function standaloneAt(
  companyId: string,
  profile: Profile,
  t: number,
  history: StandaloneMonth[],
): StandaloneMonth {
  const raw = rawVariablesAt(companyId, profile, t);
  const observed = observedMonths(profile, t);
  const previousMonth = history[history.length - 1];

  // B2 *es* la racha (SOURCE §1.3), no "¿ha habido retraso este mes?". El
  // generador produce lo segundo, así que la racha se acumula aquí y se escribe
  // de vuelta: si no, la ficha enseña "1 mes" mientras la puerta dice "6 meses".
  const delayedThisMonth = (raw.B2 as number) > 0;
  const delayStreak = delayedThisMonth ? Math.min(6, (previousMonth?.delayStreak ?? 0) + 1) : 0;
  raw.B2 = delayStreak;

  const perVariable = INDICATORS.map((item) => {
    const value = raw[item.id] ?? null;
    const confidence = confidenceOf(profile, t, value);
    // Sin dato → nota 50 y confianza 0: no opinamos, no penalizamos.
    const subscore = value === null ? 50 : subscoreOf(item.id, value, item.betterWhen);
    const effective = 50 + confidence * (subscore - 50);
    return { item, value, confidence, subscore, effective };
  });

  const blocks = {} as Record<BlockId, number>;
  for (const blockId of Object.keys(BLOCKS) as BlockId[]) {
    const inBlock = perVariable.filter((entry) => entry.item.block === blockId);
    blocks[blockId] = round(
      inBlock.reduce((sum, entry) => sum + entry.effective, 0) / inBlock.length,
      2,
    );
  }

  const standaloneScore = round(
    (Object.keys(BLOCKS) as BlockId[]).reduce(
      (sum, blockId) => sum + BLOCKS[blockId].weight * blocks[blockId],
      0,
    ),
    2,
  );

  // La confianza global mide historia, no cobertura de variables: SOURCE §2.0 la
  // define como "≈ 6 meses con movimientos". Que a una empresa le falten cuotas
  // o facturas ya se penaliza en la confianza de cada variable.
  const confidence = round(clamp((observed / 6) * profile.classifiedShare, 0, 1), 3);

  // Peso efectivo = peso de bloque ÷ nº de variables del bloque (pesos
  // intrabloque iguales, decisión #4). La suma de contribuciones ES el score.
  const contributions = perVariable.map((entry) => {
    const inBlock = INDICATORS.filter((candidate) => candidate.block === entry.item.block).length;
    const weight = BLOCKS[entry.item.block].weight / inBlock;
    return {
      indicator: entry.item.id,
      raw: entry.value,
      subscore: entry.subscore,
      confidence: entry.confidence,
      weight: round(weight, 4),
      contribution: round(weight * entry.effective, 3),
    };
  });

  const deficitStreak =
    (raw.A1 as number) < 0 ? Math.min(12, (previousMonth?.deficitStreak ?? 0) + 1) : 0;

  return {
    month: CALENDAR[t],
    standaloneScore,
    confidence,
    blocks,
    contributions,
    coverage: {
      observedMonths: observed,
      classifiedShare: profile.classifiedShare,
      hasInvoices: profile.hasInvoices,
      hasDebt: profile.hasDebt,
      hasCreditLine: profile.hasCreditLine,
    },
    raw,
    delayStreak,
    deficitStreak,
    revenue: Math.round(profile.monthlyRevenue * (0.85 + profile.health[t] * 0.3)),
  };
}

/* ------------------------------------------------------------------ *
 * Bloque D: aval y contagio de grupo (SOURCE §1.7)
 * ------------------------------------------------------------------ */

const W_MAX = 0.4;
const SATURATION = 0.2;
const ADJUSTMENT_CAP = 20;

function groupAdjustmentFor(
  companyId: string,
  groupId: string,
  siblings: { id: string; standaloneScore: number; revenue: number }[],
  self: { standaloneScore: number; revenue: number },
): GroupAdjustment | null {
  if (siblings.length === 0) return null;

  const random = rng(`${companyId}:group`);
  const groupRevenue = siblings.reduce((sum, peer) => sum + peer.revenue, self.revenue);
  const share = round(self.revenue / groupRevenue, 4);

  const peerRevenue = siblings.reduce((sum, peer) => sum + peer.revenue, 0);
  const peerScore = round(
    siblings.reduce((sum, peer) => sum + peer.standaloneScore * peer.revenue, 0) / peerRevenue,
    2,
  );

  // D5 interdependencia y D3 capacidad de aval: no se pueden derivar de los
  // metadatos, así que son deterministas por empresa dentro de rangos realistas.
  const interdependence = round(random() * 0.34, 4);
  const support = round(0.3 + random() * 2.6, 3);

  const weight = round(W_MAX * Math.min(1, interdependence / SATURATION), 4);
  const gap = peerScore - self.standaloneScore;

  // Asimetría deliberada (decisión #16): el aval exige capacidad, el contagio no.
  const rawAdjustment = gap > 0 ? weight * Math.min(1, support / 2) * gap : weight * gap;

  return {
    groupId,
    siblings: siblings.length,
    weight,
    peerScore,
    support,
    share,
    interdependence,
    adjustment: round(clamp(rawAdjustment, -ADJUSTMENT_CAP, ADJUSTMENT_CAP), 2),
  };
}

/* ------------------------------------------------------------------ *
 * Decisión (SOURCE §2)
 * ------------------------------------------------------------------ */

/** T_max por banda y tendencia (SOURCE §2.2). Peor score → menos exposición al futuro. */
function tenorCap(band: "A" | "B" | "C", nature: string, direction: string): number {
  const deteriorating = direction === "deterioro";
  const structural = deteriorating && nature === "estructural";
  const table = {
    A: { normal: 180, temporal: 120, estructural: 60 },
    B: { normal: 120, temporal: 90, estructural: 30 },
    C: { normal: 60, temporal: 30, estructural: 0 },
  }[band];
  if (!table) return 0;
  if (structural) return table.estructural;
  if (deteriorating) return table.temporal;
  return table.normal;
}

function buildDecision(args: {
  month: StandaloneMonth;
  score: number;
  confidence: number;
  direction: string;
  nature: string;
  previousLimit: number;
  reducedLastMonth: boolean;
}): Decision {
  const { month, score, confidence, direction, nature, previousLimit } = args;
  const cobros = month.revenue;
  const margin = month.raw.A1 as number;
  const pagos = cobros * (1 - margin);
  const debtService = month.coverage.hasDebt ? cobros * ((month.raw.A4 as number) * 0.8) : 0;

  const adverseCapacity = Math.max(0, (0.8 * cobros - 1.1 * pagos) / 1.3 - debtService);
  const capacityLimit = adverseCapacity * 12;
  const operatingLimit = 0.8 * cobros * 3;

  const band = deriveBanda(score);
  const overdue = (month.raw.C4 as number | null) ?? 0;

  const gates: Gate[] = [
    {
      id: "historia",
      label: "Historia suficiente",
      passed: confidence >= 0.5,
      detail: `Confianza ${Math.round(confidence * 100)} %, mínimo 50 %.`,
    },
    {
      id: "estado",
      label: "Score de al menos 45",
      passed: score >= 45,
      detail: `Score ${Math.round(score)}, mínimo 45.`,
    },
    {
      id: "fiabilidad",
      label: "Paga las obligaciones esperadas",
      passed: month.delayStreak < 2,
      detail:
        month.delayStreak < 2
          ? `Racha de retraso de ${month.delayStreak} ${month.delayStreak === 1 ? "mes" : "meses"}.`
          : `${month.delayStreak} meses seguidos sin pagar una obligación esperada.`,
    },
    {
      id: "caja",
      label: "La caja aguanta la cuota",
      passed: month.deficitStreak < 3 && adverseCapacity > 0,
      detail:
        adverseCapacity > 0
          ? `Cubre ${Math.round(adverseCapacity).toLocaleString("es-ES")} € al mes con caja estresada.`
          : "Con caja estresada no cubre ni las cuotas actuales.",
    },
    {
      id: "clientes",
      label: "Vencido bajo control",
      passed: overdue <= 0.4,
      detail: `${Math.round(overdue * 100)} % de lo facturado está vencido sin cobrar, máximo 40 %.`,
    },
    {
      id: "grupo",
      label: "Grupo sin cross-default",
      passed: true,
      detail: "Ninguna empresa que sostenga al grupo está en cierre.",
    },
  ];

  const bandConfig = BANDA[band];
  const structuralDowngrade = direction === "deterioro" && nature === "estructural";

  // Banda C con deterioro estructural no presta a ningún plazo (SOURCE §2.2), así
  // que es una puerta más: sin plazo posible no hay operación que ofrecer.
  const tenorByBand = band === "D" ? 0 : tenorCap(band, nature, direction);
  gates.push({
    id: "plazo",
    label: "Hay algún plazo posible",
    passed: tenorByBand > 0,
    detail:
      tenorByBand > 0
        ? `Hasta ${tenorByBand} días en banda ${band}.`
        : band === "D"
          ? "Banda D: no se presta."
          : `Banda ${band} con deterioro estructural: no se presta a ningún plazo.`,
  });

  const failed = gates.find((gate) => !gate.passed);
  const eligible = !failed;
  const maxTenorDays = eligible ? tenorByBand : 0;

  const effectiveFactor = structuralDowngrade
    ? BANDA[deriveBanda(Math.max(0, score - 15))].factor
    : bandConfig.factor;

  const rawLimit = eligible
    ? Math.min(capacityLimit, operatingLimit) * effectiveFactor * Math.min(1, confidence / 0.6)
    : 0;

  // Histéresis: el grifo no oscila con un mes ruidoso (±25 %/mes, salvo cierre).
  // Se redondea antes de acotar; al revés, el redondeo se come la cota.
  // Los importes se presentan en miles. Una capacidad positiva pero diminuta se
  // redondea a mil, no a cero: "elegible por 0 €" no es una frase que signifique nada.
  const rounded = rawLimit > 0 ? Math.max(1000, Math.round(rawLimit / 1000) * 1000) : 0;
  const limit =
    previousLimit > 0 && eligible
      ? clamp(
          rounded,
          Math.ceil((previousLimit * 0.75) / 1000) * 1000,
          Math.floor((previousLimit * 1.25) / 1000) * 1000,
        )
      : rounded;

  const confidencePremium = confidence < 0.7 ? 1 : 0;
  const trendAdjustment = direction === "mejora" ? -0.5 : direction === "deterioro" ? 1 : 0;
  const aprAt = (days: number) =>
    round(
      bandConfig.baseApr +
        0.5 * Math.max(0, (days - 30) / 30) +
        confidencePremium +
        trendAdjustment,
      2,
    );

  // Región factible de SOURCE §2.4: cantidad ≤ L y cantidad ≤ capacidad × meses.
  // Plazo corto, poco dinero barato; plazo largo, más dinero y más caro.
  const menu: TenorOption[] = [];
  for (let days = 30; days <= maxTenorDays; days += 30) {
    const feasible = Math.min(limit, adverseCapacity * (days / 30));
    const maxAmount = feasible > 0 ? Math.max(1000, Math.round(feasible / 1000) * 1000) : 0;
    if (maxAmount <= 0) continue;
    const apr = aprAt(days);
    menu.push({ days, maxAmount, apr, cost: Math.round((maxAmount * apr * days) / 100 / 360) });
  }

  let action: Accion;
  if (!eligible) action = "cerrar";
  else if (previousLimit === 0) action = "abrir";
  else if (limit > previousLimit * 1.15 && direction !== "deterioro") action = "ampliar";
  else if (structuralDowngrade || (limit < previousLimit * 0.85 && args.reducedLastMonth))
    action = "reducir";
  else action = "mantener";

  const reason = buildReason({
    action,
    failed,
    band,
    score,
    direction,
    nature,
    limit,
    previousLimit,
  });

  return {
    eligible,
    reason,
    gates,
    band,
    limit,
    previousLimit,
    maxTenorDays,
    baseApr: bandConfig.baseApr,
    apr: menu.length > 0 ? menu[0].apr : aprAt(30),
    aprBreakdown: {
      base: bandConfig.baseApr,
      tenorPremium: 0,
      confidencePremium,
      trendAdjustment,
      /* La demo no proyecta: la prima de previsión solo la trae el motor. */
      forecastPremium: 0,
    },
    menu,
    action,
    adverseCapacity: Math.round(adverseCapacity),
    capacityLimit: Math.round(capacityLimit),
    operatingLimit: Math.round(operatingLimit),
  };
}

/** La frase que el analista lee primero y repite en comité. */
function buildReason(args: {
  action: Accion;
  failed: Gate | undefined;
  band: string;
  score: number;
  direction: string;
  nature: string;
  limit: number;
  previousLimit: number;
}): string {
  const { action, failed, band, score, direction, nature, limit, previousLimit } = args;
  const euros = (value: number) => `${Math.round(value).toLocaleString("es-ES")} €`;

  if (action === "cerrar") {
    const cause = failed?.detail ?? `Score ${Math.round(score)}, por debajo del mínimo de 45.`;
    // Cerrar una línea viva y no abrir una que nunca existió son la misma acción
    // en el modelo, pero no la misma noticia para quien lee la cartera.
    return previousLimit > 0 ? `Se cierra la línea. ${cause}` : `Sigue sin línea. ${cause}`;
  }
  if (action === "abrir") {
    return `Pasa todas las puertas. Se abre con ${euros(limit)} en banda ${band}.`;
  }
  if (action === "ampliar") {
    const growth = Math.round((limit / previousLimit - 1) * 100);
    return `La caja da para más: el límite sube un ${growth} % hasta ${euros(limit)}, y la tendencia acompaña.`;
  }
  if (action === "reducir") {
    return nature === "estructural"
      ? `Deterioro estructural: baja una banda y el límite se recorta a ${euros(limit)}.`
      : `Segundo mes consecutivo de caída: el límite se recorta a ${euros(limit)}.`;
  }
  const trend =
    direction === "mejora"
      ? "la tendencia mejora, pero no lo suficiente para ampliar"
      : direction === "deterioro"
        ? "hay deterioro, aunque todavía temporal"
        : "sin cambios apreciables";
  return `Se mantiene en ${euros(limit)}, banda ${band}: ${trend}.`;
}

/* ------------------------------------------------------------------ *
 * Alertas
 * ------------------------------------------------------------------ */

function buildAlerts(
  companyId: string,
  months: { month: string; score: number; raw: RawVariables; delayStreak: number }[],
  t: number,
): Alert[] {
  const alerts: Alert[] = [];
  const current = months[t];

  // Caída sostenida del score: la señal aparece cuando empieza a torcerse, y se
  // confirma cuando acumula 6 puntos. La distancia entre las dos fechas es el
  // argumento comercial entero del producto.
  if (t >= 4) {
    const drop = months[t - 3].score - current.score;
    if (drop >= 6) {
      let onset = t - 3;
      while (onset > 0 && months[onset - 1].score > months[onset].score) onset -= 1;
      let confirmed = t;
      for (let i = onset + 1; i <= t; i++) {
        if (months[onset].score - months[i].score >= 6) {
          confirmed = i;
          break;
        }
      }
      alerts.push({
        type: "deterioro",
        label: `El score cae ${Math.round(drop)} puntos en 3 meses`,
        indicator: "score",
        onsetMonth: months[onset].month,
        confirmedMonth: months[confirmed].month,
        severity: drop >= 12 ? "critica" : "aviso",
      });
    }
  }

  if (current.delayStreak >= 2) {
    const onset = Math.max(0, t - current.delayStreak + 1);
    alerts.push({
      type: "impago",
      label: `${current.delayStreak} meses seguidos sin pagar una obligación esperada`,
      indicator: "B2",
      onsetMonth: months[onset].month,
      confirmedMonth: months[Math.min(t, onset + 1)].month,
      severity: "critica",
    });
  }

  const overdue = current.raw.C4 as number | null;
  if (overdue !== null && overdue > 0.4) {
    alerts.push({
      type: "vencido",
      label: `${Math.round(overdue * 100)} % de lo facturado está vencido sin cobrar`,
      indicator: "C4",
      onsetMonth: months[Math.max(0, t - 2)].month,
      confirmedMonth: current.month,
      severity: "critica",
    });
  }

  const concentration = current.raw.C1 as number;
  if (concentration > 0.8) {
    alerts.push({
      type: "concentracion",
      label: `Los tres primeros clientes son el ${Math.round(concentration * 100)} % de los cobros`,
      indicator: "C1",
      onsetMonth: months[Math.max(0, t - 1)].month,
      confirmedMonth: current.month,
      severity: "aviso",
    });
  }

  return alerts;
}

/* ------------------------------------------------------------------ *
 * Construcción de la cartera completa
 * ------------------------------------------------------------------ */

export type CompanyDataset = {
  meta: CompanyMeta;
  months: MonthScore[];
};

let cache: Map<string, CompanyDataset> | null = null;

export function buildPortfolio(): Map<string, CompanyDataset> {
  if (cache) return cache;

  const groupSizes = new Map<string, number>();
  for (const seed of COMPANY_SEED) {
    groupSizes.set(seed.groupId, (groupSizes.get(seed.groupId) ?? 0) + 1);
  }

  // Paso 1: score en solitario de todas las empresas, todos los meses. El ajuste
  // de grupo necesita conocer a las hermanas antes de poder calcularse.
  const profiles = new Map<string, Profile>();
  const standalone = new Map<string, StandaloneMonth[]>();
  for (const seed of COMPANY_SEED) {
    const profile = buildProfile(seed.id);
    profiles.set(seed.id, profile);
    const series: StandaloneMonth[] = [];
    for (let t = 0; t < CALENDAR.length; t++) {
      series.push(standaloneAt(seed.id, profile, t, series));
    }
    standalone.set(seed.id, series);
  }

  // Paso 2: grupo, score final, evolución y decisión, mes a mes y en orden
  // (la acción de este mes depende del límite del anterior).
  const result = new Map<string, CompanyDataset>();

  for (const seed of COMPANY_SEED) {
    const own = standalone.get(seed.id)!;
    const siblingIds = COMPANY_SEED.filter(
      (candidate) => candidate.groupId === seed.groupId && candidate.id !== seed.id,
    ).map((candidate) => candidate.id);

    const months: MonthScore[] = [];
    const scoreTrail: { month: string; score: number; raw: RawVariables; delayStreak: number }[] =
      [];
    let previousLimit = 0;
    let reducedLastMonth = false;

    for (let t = 0; t < CALENDAR.length; t++) {
      const current = own[t];

      const group = groupAdjustmentFor(
        seed.id,
        seed.groupId,
        siblingIds.map((id) => ({
          id,
          standaloneScore: standalone.get(id)![t].standaloneScore,
          revenue: standalone.get(id)![t].revenue,
        })),
        { standaloneScore: current.standaloneScore, revenue: current.revenue },
      );

      const score = round(clamp(current.standaloneScore + (group?.adjustment ?? 0), 0, 100), 2);

      scoreTrail.push({
        month: current.month,
        score,
        raw: current.raw,
        delayStreak: current.delayStreak,
      });

      const threeMonthsAgo = t >= 3 ? scoreTrail[t - 3].score : null;
      const trend3m = threeMonthsAgo === null ? null : round(score - threeMonthsAgo, 2);
      const direction = deriveDireccion(trend3m);

      const previousMonth = months[t - 1];
      const sameDirectionTwice = previousMonth?.direction === direction && direction !== "estable";
      const movers = current.contributions.filter((entry, index) => {
        const before = own[t - 1]?.contributions[index];
        if (!before) return false;
        const shift = entry.contribution - before.contribution;
        return direction === "mejora" ? shift > 0.05 : shift < -0.05;
      });
      const cashMoved = movers.some((entry) => ["A1", "A2", "A3"].includes(entry.indicator));
      const nature =
        direction === "estable"
          ? ("sin_cambio" as const)
          : sameDirectionTwice && movers.length >= 2 && cashMoved
            ? ("estructural" as const)
            : ("temporal" as const);

      const decision = buildDecision({
        month: current,
        score,
        confidence: current.confidence,
        direction,
        nature,
        previousLimit,
        reducedLastMonth,
      });

      const contributions: Contribution[] = current.contributions.map((entry, index) => {
        const before = own[t - 1]?.contributions[index];
        return {
          ...entry,
          delta: round(entry.contribution - (before?.contribution ?? entry.contribution), 3),
        };
      });

      months.push({
        company: seed.id,
        month: current.month,
        score,
        standaloneScore: current.standaloneScore,
        confidence: current.confidence,
        estado: deriveEstado(score, current.confidence, current.delayStreak),
        blocks: current.blocks,
        contributions,
        trend3m,
        direction,
        nature,
        group,
        decision,
        alerts: buildAlerts(seed.id, scoreTrail, t),
        coverage: current.coverage,
      });

      reducedLastMonth = decision.limit < previousLimit * 0.85;
      previousLimit = decision.limit;
    }

    result.set(seed.id, {
      meta: {
        id: seed.id,
        groupId: seed.groupId,
        country: seed.country,
        currency: seed.currency,
        erp: seed.erp,
        groupSize: groupSizes.get(seed.groupId) ?? 1,
      },
      months,
    });
  }

  cache = result;
  return result;
}
