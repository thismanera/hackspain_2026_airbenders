import { PARAMS, type Bloque, type VariableId } from "@/lib/features/scoring/params";
import type { Contribution, Estado, Percentiles, VariableSet } from "@/lib/features/scoring/types";
import { clamp } from "@/lib/features/scoring/windows";

export function subnota(id: VariableId, raw: number | null, percentiles: Percentiles): number {
  if (raw === null || !Number.isFinite(raw)) return 50;
  const { p5, p95 } = percentiles[id];
  if (!(p95 > p5)) return 50;
  const u = clamp((raw - p5) / (p95 - p5));
  return 100 * (PARAMS.mejor[id] === "alto" ? u : 1 - u);
}

/** prev = [racha(t-1), racha(t-2), racha(t-3)]. Decisión 7. */
export function subnotaB2(racha: number, prev: number[]): number {
  if (racha >= 2) return 0;
  if (racha === 1) return PARAMS.subnotaRacha1;
  for (let k = 1; k <= PARAMS.decaimientoMeses; k++) {
    const r = prev[k - 1] ?? 0;
    if (r > 0) {
      const base = r === 1 ? PARAMS.subnotaRacha1 : 0;
      return base + ((100 - base) * k) / PARAMS.decaimientoMeses;
    }
  }
  return 100;
}

export function sano(
  id: VariableId,
  raw: number | null,
): Pick<Contribution, "umbralSano" | "sano"> {
  const u = PARAMS.umbralSano[id];
  if (u === undefined) return { umbralSano: null, sano: null };
  if (raw === null) return { umbralSano: u, sano: null };
  return { umbralSano: u, sano: PARAMS.mejor[id] === "alto" ? raw >= u : raw <= u };
}

export type Aggregated = {
  contributions: Contribution[];
  subscores: Record<Bloque, number>;
  confs: Record<Bloque, number>;
  scoreSolo: number;
  confianza: number;
};

export function aggregate(
  vars: VariableSet,
  racha: { rachaB2: number; rachaB2Prev: number[] },
  percentiles: Percentiles,
): Aggregated {
  const contributions: Contribution[] = [];
  const subscores = { A: 0, B: 0, C: 0 };
  const confs = { A: 0, B: 0, C: 0 };
  for (const bloque of ["A", "B", "C"] as const) {
    const ids = PARAMS.bloques[bloque];
    for (const id of ids) {
      const v = vars[id];
      const s =
        id === "B2"
          ? v.raw === null
            ? 50
            : subnotaB2(racha.rachaB2, racha.rachaB2Prev)
          : subnota(id, v.raw, percentiles);
      const notaEf = 50 + v.conf * (s - 50);
      const aportacion = (PARAMS.pesos[bloque] / ids.length) * notaEf;
      contributions.push({
        id,
        raw: v.raw,
        subnota: s,
        conf: v.conf,
        aportacion,
        ...sano(id, v.raw),
      });
      subscores[bloque] += notaEf / ids.length;
      confs[bloque] += v.conf / ids.length;
    }
  }
  const scoreSolo = contributions.reduce((a, c) => a + c.aportacion, 0);
  const confianza = PARAMS.pesos.A * confs.A + PARAMS.pesos.B * confs.B + PARAMS.pesos.C * confs.C;
  return { contributions, subscores, confs, scoreSolo, confianza };
}

export function estado(score: number, confianza: number, rachaB2: number): Estado {
  if (confianza < PARAMS.confSinDatos) return "sin_datos";
  if (score < PARAMS.scoreRiesgo || rachaB2 >= 2) return "riesgo";
  if (score >= PARAMS.scoreSana && confianza >= PARAMS.confSana) return "sana";
  return "vigilar";
}
