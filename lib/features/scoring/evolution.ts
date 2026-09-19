import { PARAMS } from "@/lib/features/scoring/params";
import type { Alert, Contribution, Direccion, Naturaleza, Senales } from "@/lib/features/scoring/types";

export function direccion(score: number, score3: number | null): Direccion {
  if (score3 === null) return "estable";
  const d = score - score3;
  if (d >= PARAMS.umbralDireccion) return "mejora";
  if (d <= -PARAMS.umbralDireccion) return "deterioro";
  return "estable";
}

const NIVEL = new Set(["A1", "A2", "A3"]);

export function naturaleza(
  dir: Direccion,
  dirPrev: Direccion,
  contributions: Contribution[],
  contributions3: Contribution[] | null,
): Naturaleza {
  if (dir === "estable") return "sin_cambio";
  if (dirPrev !== dir || !contributions3) return "temporal";
  const sign = dir === "mejora" ? 1 : -1;
  const moved = contributions.filter((c) => {
    const before = contributions3.find((x) => x.id === c.id);
    return before && sign * (c.aportacion - before.aportacion) >= PARAMS.deltaAportacionMin;
  });
  return moved.length >= PARAMS.minVariablesEstructural && moved.some((c) => NIVEL.has(c.id)) ? "estructural" : "temporal";
}

export function deltas(now: Contribution[], prev: Contribution[] | null): { id: Contribution["id"]; delta: number }[] {
  return now.map((c) => ({ id: c.id, delta: c.aportacion - (prev?.find((p) => p.id === c.id)?.aportacion ?? c.aportacion) }));
}

const RULES: { tipo: string; flag: keyof Senales; meses: number }[] = [
  { tipo: "deterioro", flag: "deterioro", meses: 2 },
  { tipo: "deterioro_estructural", flag: "estructural", meses: 1 },
  { tipo: "recuperacion", flag: "mejora", meses: 2 },
  { tipo: "deficit_persistente", flag: "deficit", meses: 3 },
  { tipo: "impago_obligaciones", flag: "impago", meses: 1 },
  { tipo: "vencido_alto", flag: "vencidoAlto", meses: 1 },
  { tipo: "contagio_grupo", flag: "contagio", meses: 1 },
  { tipo: "datos_insuficientes", flag: "datosInsuficientes", meses: 1 },
];

/** prev: señales de los meses anteriores en orden cronológico; months: meses de prev seguidos del actual. */
export function computeAlerts(now: Senales, prev: Senales[], months: string[]): Alert[] {
  const all = [...prev, now];
  const out: Alert[] = [];
  for (const r of RULES) {
    if (!now[r.flag]) continue;
    let run = 0;
    for (let i = all.length - 1; i >= 0 && all[i][r.flag]; i--) run++;
    if (run >= r.meses) out.push({ tipo: r.tipo, desdeMes: months[all.length - run] });
  }
  return out;
}
