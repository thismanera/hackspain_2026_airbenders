/**
 * Lectura en llano de lo que el motor ya ha calculado. Aquí no se decide nada:
 * se ordenan las cifras de la ficha en dos o tres frases que se puedan leer en
 * voz alta en un comité, con cada frase anclada a la variable o puerta que la
 * sostiene. Si algún día un modelo de lenguaje redacta esto, tendrá que citar
 * exactamente lo mismo.
 */
import { CALENDAR } from "./calendar";
import {
  formatApr,
  formatDecimal,
  formatEuros,
  formatIndicatorValue,
  formatMonthShort,
  formatSigned,
} from "./format";
import { indicator } from "./indicators";
import type { CompanyFileResponse, Contribution, GroupFileResponse, MonthScore } from "./types";
import { ACCION, ESTADO } from "./vocabulary";

export type Citation = {
  /** `A1`, `puerta:caja`, `grupo`… lo que el lector puede ir a comprobar. */
  ref: string;
  label: string;
};

export type Sentence = {
  text: string;
  citations: Citation[];
};

export type Narrative = {
  /** Una línea: lo que hay que saber si solo se lee una. */
  headline: string;
  sentences: Sentence[];
};

function cite(contribution: Contribution): Citation | null {
  const meta = indicator(contribution.indicator);
  return meta ? { ref: meta.id, label: meta.label } : null;
}

function describe(contribution: Contribution): string {
  const meta = indicator(contribution.indicator);
  if (!meta) return "";
  const value = formatIndicatorValue(contribution.raw, meta.format);
  return `${meta.label.toLowerCase()} (${value})`;
}

function lever(contribution: Contribution): string {
  const meta = indicator(contribution.indicator);
  if (!meta) return "";
  if (contribution.indicator === "B2") {
    return `pagar las obligaciones esperadas este mes (lleva ${formatIndicatorValue(contribution.raw, meta.format)} seguidos sin hacerlo)`;
  }
  const threshold =
    meta.healthy !== undefined
      ? ` hasta ${meta.betterWhen === "alto" ? "al menos" : "como mucho"} ${formatIndicatorValue(meta.healthy, meta.format)}`
      : "";
  return `${meta.betterWhen === "alto" ? "subir" : "bajar"} ${meta.label.toLowerCase()}${threshold}`;
}

function joinEs(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

/** Variables con dato, ordenadas por lo que más pesan hoy en contra o a favor. */
function weakest(month: MonthScore, count: number): Contribution[] {
  return month.contributions
    .filter((entry) => entry.raw !== null)
    .sort((a, b) => a.subscore - b.subscore)
    .slice(0, count);
}

function strongest(month: MonthScore, count: number): Contribution[] {
  return month.contributions
    .filter((entry) => entry.raw !== null)
    .sort((a, b) => b.subscore - a.subscore)
    .slice(0, count);
}

function movers(
  month: MonthScore,
  count: number,
  sense: "up" | "down" | "any" = "any",
): Contribution[] {
  return month.contributions
    .filter((entry) => {
      if (entry.raw === null || Math.abs(entry.delta) < 0.05) return false;
      if (sense === "down") return entry.delta < 0;
      if (sense === "up") return entry.delta > 0;
      return true;
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, count);
}

/** Qué ha pasado con la decisión de este mes y por qué. */
export function decisionNarrative(file: CompanyFileResponse): Narrative {
  const { latest, previous } = file;
  const { decision } = latest;
  const sentences: Sentence[] = [];

  const actionLabel = ACCION[decision.action].label.toLowerCase();
  const limitDelta = decision.limit - decision.previousLimit;

  const failed = decision.gates.find((gate) => !gate.passed);

  let headline: string;
  if (!decision.eligible) {
    const why = (failed?.detail ?? decision.reason).trim().replace(/\.$/, "");
    const whyLower = why.charAt(0).toLowerCase() + why.slice(1);
    headline =
      decision.previousLimit > 0
        ? `Se cierra la línea de ${formatEuros(decision.previousLimit)}: ${whyLower}.`
        : `Sin línea este mes: ${whyLower}.`;
    sentences.push({
      text: `${why}.`,
      citations: failed ? [{ ref: `puerta:${failed.id}`, label: failed.label }] : [],
    });
  } else if (decision.action === "mantener") {
    headline = `Se mantiene el límite en ${formatEuros(decision.limit)} al ${formatApr(decision.apr)}.`;
  } else if (decision.action === "abrir") {
    headline = `Se abre línea por ${formatEuros(decision.limit)} al ${formatApr(decision.apr)}.`;
  } else {
    headline = `Se decide ${actionLabel}: ${formatEuros(decision.previousLimit)} → ${formatEuros(decision.limit)} (${formatSigned(limitDelta, 0)} €).`;
  }

  if (decision.eligible) {
    sentences.push({
      text: `Banda ${decision.band} con score ${Math.round(latest.score)}: hasta ${decision.maxTenorDays} días al ${formatApr(decision.apr)}.`,
      citations: [{ ref: "banda", label: `Banda ${decision.band}` }],
    });
  }

  if (previous) {
    const scoreDelta = latest.score - previous.score;
    const moved = movers(latest, 2, scoreDelta >= 0 ? "up" : "down");
    if (moved.length > 0) {
      const verb = scoreDelta >= 0 ? "sube" : "baja";
      sentences.push({
        text: `El score ${verb} ${formatDecimal(Math.abs(scoreDelta))} puntos desde el mes pasado, sobre todo por ${joinEs(moved.map(describe))}.`,
        citations: moved.map(cite).filter((c): c is Citation => c !== null),
      });
    }
  }

  if (latest.group && Math.abs(latest.group.adjustment) >= 0.5) {
    const positive = latest.group.adjustment > 0;
    sentences.push({
      text: positive
        ? `El grupo la sostiene: suma ${formatSigned(latest.group.adjustment)} puntos por el aval de sus ${latest.group.siblings} hermanas.`
        : `El grupo le pesa: resta ${formatDecimal(Math.abs(latest.group.adjustment))} puntos porque el resto del grupo puntúa ${Math.round(latest.group.peerScore)}.`,
      citations: [{ ref: "grupo", label: "Bloque D · grupo" }],
    });
  }

  if (latest.alerts.length > 0) {
    const critical = latest.alerts.filter((alert) => alert.severity === "critica");
    const alert = critical[0] ?? latest.alerts[0];
    const alreadyTold = sentences.some((sentence) =>
      sentence.text.toLowerCase().includes(alert.label.toLowerCase()),
    );
    const lead = CALENDAR.indexOf(alert.confirmedMonth) - CALENDAR.indexOf(alert.onsetMonth);
    sentences.push({
      text: alreadyTold
        ? `La alerta se detectó en ${formatMonthShort(alert.onsetMonth)} y se confirmó en ${formatMonthShort(alert.confirmedMonth)}${lead > 0 ? ` (${lead} ${lead === 1 ? "mes" : "meses"} de aviso)` : ""}.`
        : `${latest.alerts.length === 1 ? "Hay una alerta activa" : `Hay ${latest.alerts.length} alertas activas`}; la más grave: ${alert.label.toLowerCase()}.`,
      citations: [{ ref: alert.indicator, label: indicator(alert.indicator)?.label ?? "Score" }],
    });
  }

  return { headline, sentences };
}

/** Qué sostiene y qué lastra el score, sin decidir nada. */
export function scoreNarrative(file: CompanyFileResponse): Narrative {
  const { latest } = file;
  const sentences: Sentence[] = [];

  const estado = ESTADO[latest.estado].label;
  const weak = weakest(latest, 2);
  const headline =
    latest.estado === "sin_datos"
      ? `Sin datos suficientes: la confianza es del ${Math.round(latest.confidence * 100)} %.`
      : weak[0]
        ? `${estado}, ${Math.round(latest.score)} sobre 100. Lastra ${describe(weak[0])}.`
        : `${estado}, ${Math.round(latest.score)} sobre 100.`;
  if (weak.length > 0) {
    sentences.push({
      text: `Lo que más pesa en contra: ${joinEs(weak.map(describe))}.`,
      citations: weak.map(cite).filter((c): c is Citation => c !== null),
    });
  }

  const strong = strongest(latest, 2);
  if (strong.length > 0) {
    sentences.push({
      text: `Lo que la sostiene: ${joinEs(strong.map(describe))}.`,
      citations: strong.map(cite).filter((c): c is Citation => c !== null),
    });
  }

  if (latest.trend3m !== null && latest.direction !== "estable") {
    sentences.push({
      text:
        latest.direction === "deterioro"
          ? `Lleva ${formatSigned(latest.trend3m)} puntos en tres meses; el motor lo clasifica como deterioro ${latest.nature === "estructural" ? "estructural, con las variables de caja moviéndose a la vez" : "temporal"}.`
          : `Mejora ${formatSigned(latest.trend3m)} puntos en tres meses${latest.nature === "estructural" ? ", y la mejora es estructural" : ""}.`,
      citations: [{ ref: "tendencia", label: "Tendencia 3 m" }],
    });
  }

  return { headline, sentences };
}

/** Respuesta a "¿qué tendría que mejorar?": las palancas, en orden. */
export function improvementNarrative(file: CompanyFileResponse): Narrative {
  const { latest } = file;
  const { decision } = latest;
  const sentences: Sentence[] = [];

  const failedGates = decision.gates.filter((gate) => !gate.passed);
  if (failedGates.length > 0) {
    sentences.push({
      text: `Antes que nada tiene que pasar ${failedGates.length === 1 ? "la puerta que falla" : `las ${failedGates.length} puertas que fallan`}: ${joinEs(failedGates.map((gate) => gate.detail.replace(/\.$/, "").toLowerCase()))}. Sin eso no hay límite, por bueno que sea el score.`,
      citations: failedGates.map((gate) => ({ ref: `puerta:${gate.id}`, label: gate.label })),
    });
  }

  const weak = weakest(latest, 3).filter((entry) => entry.subscore < 60);
  if (weak.length > 0) {
    const targets = weak.map((entry) => lever(entry)).filter(Boolean);
    sentences.push({
      text: `Las palancas con más recorrido: ${joinEs(targets)}. Son las variables que menos puntúan hoy.`,
      citations: weak.map(cite).filter((c): c is Citation => c !== null),
    });
  }

  if (decision.eligible && decision.band !== "A") {
    const next = decision.band === "B" ? 75 : decision.band === "C" ? 60 : 45;
    sentences.push({
      text: `Con ${next - Math.round(latest.score)} puntos más pasaría a banda ${decision.band === "B" ? "A" : decision.band === "C" ? "B" : "C"}: más plazo, más importe y menos precio.`,
      citations: [{ ref: "banda", label: `Umbral banda ${next}` }],
    });
  }

  if (latest.confidence < 0.5) {
    sentences.push({
      text: `La confianza es baja (${Math.round(latest.confidence * 100)} %): con más meses de movimientos clasificados el mismo score valdría más.`,
      citations: [{ ref: "confianza", label: "Confianza" }],
    });
  }

  const headline =
    sentences.length === 0
      ? "Está en banda A y pasa todas las puertas: no hay palanca pendiente."
      : failedGates.length > 0
        ? "Primero las puertas; luego el score."
        : "Tres palancas, por orden de recorrido.";

  return { headline, sentences };
}

/** Qué tiene que saber el analista del grupo entero. */
export function groupNarrative(group: GroupFileResponse): Narrative {
  const sentences: Sentence[] = [];
  const n = group.members.length;

  const headline =
    group.crossDefault.length > 0
      ? `Cross-default activo: ${joinEs(group.crossDefault)} cierra con peso relevante y arrastra al resto.`
      : `${group.eligible} de ${n} empresas con línea; ${formatEuros(group.exposure)} de límite vivo.`;

  if (group.previousScore !== null) {
    const delta = group.score - group.previousScore;
    sentences.push({
      text: `El score consolidado es ${Math.round(group.score)} (${formatSigned(delta)} frente al mes pasado), ponderando cada empresa por su peso en el grupo.`,
      citations: [{ ref: "D1", label: "Peso en el grupo" }],
    });
  }

  const supported = group.members.filter((member) => member.adjustment >= 0.5);
  const dragged = group.members.filter((member) => member.adjustment <= -0.5);
  if (supported.length > 0 || dragged.length > 0) {
    const parts: string[] = [];
    if (supported.length > 0) {
      parts.push(
        `El grupo sostiene a ${joinEs(supported.map((member) => `${member.id} (${formatSigned(member.adjustment)})`))}`,
      );
    }
    if (dragged.length > 0) {
      parts.push(
        `${supported.length > 0 ? "lastra" : "El grupo lastra"} a ${joinEs(dragged.map((member) => `${member.id} (${formatSigned(member.adjustment)})`))}`,
      );
    }
    sentences.push({
      text: `${parts.join(" y ")}. Cuanta más interdependencia, más se transmite en ambos sentidos.`,
      citations: [
        { ref: "D3", label: "Capacidad de aval" },
        { ref: "D5", label: "Interdependencia" },
      ],
    });
  }

  const delta = group.exposure - group.previousExposure;
  if (delta !== 0) {
    sentences.push({
      text: `El límite conjunto ${delta > 0 ? "sube" : "baja"} ${formatEuros(Math.abs(delta))} este mes; el crédito se concede empresa a empresa, el grupo solo pone el techo.`,
      citations: [{ ref: "techo", label: "Techo de grupo" }],
    });
  }

  return { headline, sentences };
}

/**
 * El bloque D visto desde una empresa: si el resto del grupo la tira o la
 * arrastra. Es la lectura de la pestaña Grupo de la ficha, no la del grupo
 * entero: aquí el sujeto es ella, no el techo.
 */
export function holdingNarrative(file: CompanyFileResponse): Narrative {
  const group = file.latest.group;
  if (!group) {
    return { headline: "Va sola: el grupo no mueve la nota.", sentences: [] };
  }

  const adj = group.adjustment;
  const headline =
    Math.abs(adj) < 0.5
      ? "El grupo no mueve la nota de forma apreciable este mes."
      : adj > 0
        ? `El resto del grupo tira de la nota: ${formatSigned(adj)} puntos.`
        : `El resto del grupo arrastra la nota: ${formatSigned(adj)} puntos.`;

  return {
    headline,
    sentences: [
      {
        text: `Pesa el ${Math.round(group.weight * 100)} % del grupo y ella el ${Math.round(group.share * 100)} %; la interdependencia es del ${Math.round(group.interdependence * 100)} %.`,
        citations: [
          { ref: "D1", label: "Peso en el grupo" },
          { ref: "D5", label: "Interdependencia" },
        ],
      },
    ],
  };
}
