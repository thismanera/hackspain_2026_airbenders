import { createHash } from "node:crypto";
import { hashParams, PARAMS, VARIABLES, type VariableId } from "@/lib/features/scoring/params";
import type { Parameters, Percentiles } from "@/lib/features/scoring/types";
import { percentile } from "@/lib/features/scoring/windows";

export function groupSplit(groups: string[]): { train: string[]; validation: string[] } {
  const key = (g: string) => createHash("sha256").update(`42:${g}`).digest("hex");
  const unique = [...new Set(groups)].sort((a, b) => key(a).localeCompare(key(b)));
  const cut = Math.ceil(unique.length * 0.7);
  return { train: unique.slice(0, cut), validation: unique.slice(cut) };
}

export type Sample = { id: VariableId; raw: number | null; conf: number };

export function fitPercentiles(
  samples: Sample[],
  train: string[],
  validation: string[],
  inputFingerprint: string,
): Parameters {
  const percentiles = {} as Percentiles;
  for (const id of VARIABLES) {
    const xs = samples
      .filter((s) => s.id === id && s.raw !== null && Number.isFinite(s.raw) && s.conf >= PARAMS.confSana)
      .map((s) => s.raw as number);
    percentiles[id] = xs.length ? { p5: percentile(xs, 0.05), p95: percentile(xs, 0.95) } : { p5: 0, p95: 1 };
  }
  const core = {
    paramsHash: hashParams(PARAMS),
    percentiles,
    trainGroups: train,
    validationGroups: validation,
    inputFingerprint,
  };
  return { ...core, version: createHash("sha256").update(JSON.stringify(core)).digest("hex") };
}
