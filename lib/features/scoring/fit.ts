import { createHash } from "node:crypto";
import { hashParams, PARAMS, VARIABLES, type VariableId } from "@/lib/features/scoring/params";
import type { Parameters, Percentiles } from "@/lib/features/scoring/types";
import { percentile } from "@/lib/features/scoring/windows";

export type GroupSplit = { train: string[]; validation: string[] };

/** Split 70/30 por grupo, determinista: orden por sha256("42:group") (§11). */
export function groupSplit(groups: string[]): GroupSplit {
  const unique = [...new Set(groups)];
  const keys = new Map(
    unique.map((g) => [g, createHash("sha256").update(`42:${g}`).digest("hex")] as const),
  );
  const sorted = unique.sort((a, b) => {
    const ka = keys.get(a)!;
    const kb = keys.get(b)!;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const cut = Math.ceil(sorted.length * 0.7);
  return { train: sorted.slice(0, cut), validation: sorted.slice(cut) };
}

export type Sample = { id: VariableId; raw: number | null; conf: number };

/**
 * Congela p5/p95 por variable (§11). Las variables con anclajes económicos se
 * persisten con percentiles nulos porque no deben depender de colas inestables.
 * El llamante debe pasar SOLO muestras de empresa-mes de los grupos de ajuste
 * (`train`) y con mes ≤ 2026-02; aquí no se filtra por grupo ni por mes, así que
 * pasar muestras de validación o posteriores al corte introduce fuga de información.
 * Una variable sin muestras fiables (`conf ≥ PARAMS.confSana`) queda en `{ p5: null, p95: null }`
 * y su subnota es neutral (50).
 */
export function fitPercentiles(
  samples: Sample[],
  train: string[],
  validation: string[],
  inputFingerprint: string,
): Parameters {
  const percentiles = {} as Percentiles;
  let c5P80: number | null = null;
  for (const id of VARIABLES) {
    if (PARAMS.escalasAncladas[id]) {
      percentiles[id] = { p5: null, p95: null };
      continue;
    }
    const xs = samples
      .filter(
        (s) => s.id === id && s.raw !== null && Number.isFinite(s.raw) && s.conf >= PARAMS.confSana,
      )
      .map((s) => s.raw as number);
    percentiles[id] = { p5: percentile(xs, 0.05), p95: percentile(xs, 0.95) };
    if (id === "C5") c5P80 = percentile(xs, PARAMS.volatilidadPercentil);
  }
  const core = {
    contratoVersion: PARAMS.contratoVersion,
    paramsHash: hashParams(PARAMS),
    percentiles,
    trainGroups: train,
    validationGroups: validation,
    inputFingerprint,
    c5P80,
  };
  return { ...core, version: createHash("sha256").update(JSON.stringify(core)).digest("hex") };
}
