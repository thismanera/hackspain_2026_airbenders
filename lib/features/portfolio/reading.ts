/**
 * Lecturas en llano de la ficha. El motor ya decidió; esto solo redacta.
 *
 * Toda lectura se materializa en `scoring:import` junto al resto del panel:
 * la plantilla determinista para cada empresa-mes y, donde un analista ha
 * escrito la suya mirando la ficha (`readings.curated.ts`), ese texto. Nada
 * se redacta en la petición y ninguna lectura puede citar un número o una
 * variable que no esté en la ficha: `sanitizeReading` lo tumba.
 */
import { z } from "zod";

import { formatIndicatorValue } from "./format";
import { indicator } from "./indicators";
import {
  decisionNarrative,
  holdingNarrative,
  improvementNarrative,
  scoreNarrative,
  type Citation,
  type Narrative,
} from "./narrative";
import { curatedReading } from "./readings.curated";
import type { CompanyFileResponse } from "./types";

export const READING_KINDS = ["decision", "score", "improvement", "grupo"] as const;
export type ReadingKind = (typeof READING_KINDS)[number];

export const readingKindSchema = z.enum(READING_KINDS);

export const READING_SOURCES = ["plantilla", "analista"] as const;
export type ReadingSource = (typeof READING_SOURCES)[number];

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

export const readingSchema = readingBodySchema.extend({
  source: z.enum(READING_SOURCES),
});

export const readingSetSchema = z.object({
  decision: readingSchema,
  score: readingSchema,
  improvement: readingSchema,
  grupo: readingSchema,
});

export type ReadingSet = z.infer<typeof readingSetSchema>;

const TEMPLATES: Record<ReadingKind, (file: CompanyFileResponse) => Narrative> = {
  decision: decisionNarrative,
  score: scoreNarrative,
  improvement: improvementNarrative,
  grupo: holdingNarrative,
};

export function templateReading(kind: ReadingKind, file: CompanyFileResponse): Reading {
  return { ...TEMPLATES[kind](file), source: "plantilla" };
}

/**
 * La lectura que se persiste para una ficha: la del analista si la hay y
 * pasa el sanitizador, la plantilla si no. Una lectura curada que invente
 * una cifra es un error de datos, no un fallback silencioso.
 */
export function readingFor(
  kind: ReadingKind,
  file: CompanyFileResponse,
  parameterVersion: string,
): Reading {
  const fallback = templateReading(kind, file);
  const curated = curatedReading(parameterVersion, file.company.id, file.month, kind);
  if (!curated) return fallback;

  const clean = sanitizeReading(curated, file, fallback);
  if (!clean) {
    throw new Error(
      `lectura curada de ${file.company.id} ${file.month} ${kind} cita cifras que no están en la ficha`,
    );
  }
  return { ...clean, source: "analista" };
}

export function readingsFor(file: CompanyFileResponse, parameterVersion: string): ReadingSet {
  return {
    decision: readingFor("decision", file, parameterVersion),
    score: readingFor("score", file, parameterVersion),
    improvement: readingFor("improvement", file, parameterVersion),
    grupo: readingFor("grupo", file, parameterVersion),
  };
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
    numbers.add(normalizeNumber(Math.abs(value).toFixed(1)));
    if (Math.abs(value) <= 1) {
      numbers.add(normalizeNumber(String(Math.round(value * 100))));
      numbers.add(normalizeNumber(Math.abs(value * 100).toFixed(1)));
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
  addNumber(latest.decision.limit - latest.decision.previousLimit);
  addNumber(latest.decision.apr);
  addNumber(latest.decision.baseApr);
  addNumber(latest.decision.maxTenorDays);
  addNumber(latest.decision.capacityLimit);
  for (const option of latest.decision.menu) {
    addNumber(option.days);
    addNumber(option.maxAmount);
    addNumber(option.apr);
  }
  addNumber(latest.scoreSolo);
  addNumber(latest.scoreGrupo);
  addNumber(latest.forecast?.scoreSoloPred3m);
  addNumber(latest.forecast?.scoreSoloPred6m);
  addNumber(latest.forecast?.scoreGrupoPred3m);
  addNumber(latest.forecast?.scoreGrupoPred6m);
  addNumber(latest.forecast?.p10Solo3m);
  addNumber(latest.forecast?.p90Solo3m);
  addNumber(previous?.score);
  addNumber(latest.score - (previous?.score ?? latest.score));
  addNumber(previous?.decision.limit);
  addNumber(previous?.decision.apr);
  for (const point of file.history) addNumber(point.score);
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
    const meta = indicator(contribution.indicator);
    if (meta && contribution.raw !== null) {
      addTokens(formatIndicatorValue(contribution.raw, meta.format));
    }
  }
  for (const gate of latest.decision.gates) addTokens(gate.detail);
  addTokens(latest.decision.reason);
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
