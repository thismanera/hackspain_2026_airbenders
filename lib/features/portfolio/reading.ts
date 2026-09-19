/**
 * Lecturas en llano de la ficha. El motor ya decidió; esto solo redacta.
 * Helmcode puede reescribir el texto, nunca inventar un número ni una cita.
 */
import { z } from "zod";

import {
  decisionNarrative,
  holdingNarrative,
  improvementNarrative,
  scoreNarrative,
  type Citation,
  type Narrative,
} from "./narrative";
import type { CompanyFileResponse } from "./types";

export const READING_KINDS = ["decision", "score", "improvement", "grupo"] as const;
export type ReadingKind = (typeof READING_KINDS)[number];

export const readingKindSchema = z.enum(READING_KINDS);

export type ReadingSource = "plantilla" | "helmcode";

export type Reading = Narrative & {
  source: ReadingSource;
};

const citationSchema = z.object({
  ref: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
});

export const readingBodySchema = z.object({
  headline: z.string().min(1).max(240),
  sentences: z
    .array(
      z.object({
        text: z.string().min(1).max(400),
        citations: z.array(citationSchema).max(8),
      }),
    )
    .max(4),
});

export type ReadingBody = z.infer<typeof readingBodySchema>;

const TEMPLATES: Record<ReadingKind, (file: CompanyFileResponse) => Narrative> = {
  decision: decisionNarrative,
  score: scoreNarrative,
  improvement: improvementNarrative,
  grupo: holdingNarrative,
};

export function templateReading(kind: ReadingKind, file: CompanyFileResponse): Reading {
  return { ...TEMPLATES[kind](file), source: "plantilla" };
}

/** Números y citas que el modelo puede mencionar. Cualquier otra cosa tumba la lectura. */
export function allowedFacts(
  file: CompanyFileResponse,
  fallback: Narrative,
): {
  numbers: Set<string>;
  refs: Set<string>;
} {
  const numbers = new Set<string>();
  const refs = new Set<string>();

  function addNumber(value: number | null | undefined) {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    numbers.add(normalizeNumber(String(value)));
    numbers.add(normalizeNumber(String(Math.round(value))));
    numbers.add(normalizeNumber(String(Math.abs(value))));
    numbers.add(normalizeNumber(String(Math.abs(Math.round(value)))));
    if (Math.abs(value) <= 1) {
      numbers.add(normalizeNumber(String(Math.round(value * 100))));
    }
  }

  const { latest, previous } = file;
  addNumber(latest.score);
  addNumber(latest.standaloneScore);
  addNumber(latest.confidence);
  addNumber(latest.trend3m);
  addNumber(latest.blocks.A);
  addNumber(latest.blocks.B);
  addNumber(latest.blocks.C);
  addNumber(latest.group?.adjustment);
  addNumber(latest.group?.peerScore);
  addNumber(latest.group?.siblings);
  addNumber(latest.group?.weight);
  addNumber(latest.group?.share);
  addNumber(latest.group?.interdependence);
  addNumber(latest.group?.support);
  addNumber(latest.decision.limit);
  addNumber(latest.decision.previousLimit);
  addNumber(latest.decision.apr);
  addNumber(latest.decision.baseApr);
  addNumber(latest.decision.maxTenorDays);
  addNumber(previous?.score);
  addNumber(previous?.decision.limit);
  addNumber(previous?.decision.apr);
  addNumber(Number(latest.month.slice(0, 4)));
  addNumber(Number(latest.month.slice(5, 7)));
  if (previous) {
    addNumber(Number(previous.month.slice(0, 4)));
    addNumber(Number(previous.month.slice(5, 7)));
  }
  for (const alert of latest.alerts) {
    addNumber(Number(alert.onsetMonth.slice(0, 4)));
    addNumber(Number(alert.confirmedMonth.slice(0, 4)));
  }
  for (const contribution of latest.contributions) {
    addNumber(contribution.raw);
    addNumber(contribution.subscore);
    addNumber(contribution.delta);
    refs.add(contribution.indicator);
  }
  for (const gate of latest.decision.gates) {
    refs.add(`puerta:${gate.id}`);
    refs.add(gate.id);
  }
  refs.add("banda");
  refs.add("grupo");
  refs.add("tendencia");
  refs.add("confianza");
  refs.add("D1");
  refs.add("D3");
  refs.add("D5");
  refs.add("techo");

  function absorb(narrative: Narrative) {
    addTokens(
      `${narrative.headline} ${narrative.sentences.map((sentence) => sentence.text).join(" ")}`,
    );
    for (const sentence of narrative.sentences) {
      for (const citation of sentence.citations) refs.add(citation.ref);
    }
  }

  absorb(fallback);
  addTokens("45 60 70 75 0 1 2 3 6 15 25 30 90 100 180 2024 2025 2026");

  function addTokens(text: string) {
    for (const token of tokenizeNumbers(text)) numbers.add(token);
  }

  return { numbers, refs };
}

export function inventedNumbers(text: string, allowed: Set<string>): string[] {
  return tokenizeNumbers(text).filter((token) => !allowed.has(token));
}

export function sanitizeReading(
  body: ReadingBody,
  file: CompanyFileResponse,
  fallback: Narrative,
): ReadingBody | null {
  const { numbers, refs } = allowedFacts(file, fallback);
  const text = `${body.headline} ${body.sentences.map((sentence) => sentence.text).join(" ")}`;
  if (inventedNumbers(text, numbers).length > 0) return null;

  const citations: Citation[] = body.sentences.flatMap((sentence) => sentence.citations);
  if (citations.some((citation) => !refs.has(citation.ref))) return null;

  return body;
}

export function buildReadingPrompt(
  kind: ReadingKind,
  file: CompanyFileResponse,
  fallback: Narrative,
): { system: string; user: string } {
  const facts = {
    empresa: file.company.id,
    mes: file.month,
    score: Math.round(file.latest.score),
    confianza: Math.round(file.latest.confidence * 100),
    estado: file.latest.estado,
    direccion: file.latest.direction,
    naturaleza: file.latest.nature,
    tendencia3m: file.latest.trend3m,
    bloques: file.latest.blocks,
    ajusteGrupo: file.latest.group?.adjustment ?? 0,
    decision: {
      accion: file.latest.decision.action,
      elegible: file.latest.decision.eligible,
      limite: file.latest.decision.limit,
      limiteAnterior: file.latest.decision.previousLimit,
      tae: file.latest.decision.apr,
      plazo: file.latest.decision.maxTenorDays,
      banda: file.latest.decision.band,
      motivo: file.latest.decision.reason,
      puertas: file.latest.decision.gates.map((gate) => ({
        id: gate.id,
        pasa: gate.passed,
        detalle: gate.detail,
      })),
    },
    alertas: file.latest.alerts.map((alert) => ({
      tipo: alert.type,
      etiqueta: alert.label,
      desde: alert.onsetMonth,
      confirmada: alert.confirmedMonth,
    })),
    cascada: file.latest.contributions
      .filter((entry) => entry.raw !== null)
      .map((entry) => ({
        id: entry.indicator,
        bruto: entry.raw,
        nota: Math.round(entry.subscore),
        delta: entry.delta,
      })),
    plantilla: fallback,
  };

  const job =
    kind === "decision"
      ? "Qué tiene que saber el analista de la decisión de este mes."
      : kind === "score"
        ? "Qué sostiene y qué lastra el score, sin decidir nada."
        : kind === "grupo"
          ? "Si el resto del grupo tira o arrastra la nota de esta empresa, y por cuánto."
          : "Qué tendría que mejorar la empresa, en orden, para abrir o ampliar línea.";

  return {
    system:
      "Redactas para un analista de riesgo. El código ya ha decidido; tú solo explicas. " +
      "Devuelve JSON { headline, sentences: [] }. " +
      "UNA sola frase en headline: acción, importe y el motivo. Nada más. " +
      "sentences vacío. Solo números que aparezcan en el JSON. " +
      "No inventes importes, plazos, TAE ni umbrales. No uses la palabra score si puedes decir nota. " +
      "No digas partner, opt-in ni Grifo.",
    user: `${job}\n\n${JSON.stringify(facts)}`,
  };
}

export async function resolveReading(
  kind: ReadingKind,
  file: CompanyFileResponse,
  generate?: (system: string, user: string) => Promise<unknown>,
): Promise<Reading> {
  const fallback = templateReading(kind, file);
  if (!generate) return fallback;

  try {
    const prompt = buildReadingPrompt(kind, file, fallback);
    const raw = await generate(prompt.system, prompt.user);
    const parsed = readingBodySchema.safeParse(raw);
    if (!parsed.success) return fallback;
    const clean = sanitizeReading(parsed.data, file, fallback);
    if (!clean) return fallback;
    return { ...clean, source: "helmcode" };
  } catch {
    return fallback;
  }
}

function tokenizeNumbers(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map(normalizeNumber);
}

function normalizeNumber(token: string): string {
  const comma = token.includes(",");
  const dot = token.includes(".");
  if (comma && dot) return stripTrailingZeros(token.replaceAll(".", "").replace(",", "."));
  if (comma) return stripTrailingZeros(token.replace(",", "."));
  const [, fraction] = token.split(".");
  if (dot && fraction?.length === 3 && !token.startsWith("0.")) {
    return stripTrailingZeros(token.replaceAll(".", ""));
  }
  return stripTrailingZeros(token);
}

function stripTrailingZeros(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
