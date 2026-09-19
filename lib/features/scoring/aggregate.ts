import { PARAMS, type Bloque, type VariableId } from "@/lib/features/scoring/params";
import type {
  Contribution,
  Estado,
  Extras,
  Percentiles,
  VariableSet,
} from "@/lib/features/scoring/types";
import { clamp } from "@/lib/features/scoring/windows";

type Coverage = Extras["cobertura"];

function anchoredSubnota(id: VariableId, raw: number): number | null {
  const anchors = PARAMS.escalasAncladas[id];
  if (!anchors || anchors.length < 2) return null;
  if (raw <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [rightRaw, rightNota] = anchors[i];
    const [leftRaw, leftNota] = anchors[i - 1];
    if (raw <= rightRaw) {
      const fraction = (raw - leftRaw) / (rightRaw - leftRaw);
      return leftNota + fraction * (rightNota - leftNota);
    }
  }
  return anchors[anchors.length - 1][1];
}

export function subnota(id: VariableId, raw: number | null, percentiles: Percentiles): number {
  if (raw === null || !Number.isFinite(raw)) return 50;
  const anchored = anchoredSubnota(id, raw);
  if (anchored !== null) return anchored;
  const scale = percentiles[id];
  if (!scale || scale.p5 === null || scale.p95 === null || !(scale.p95 > scale.p5)) return 50;
  const u = clamp((raw - scale.p5) / (scale.p95 - scale.p5));
  return 100 * (PARAMS.mejor[id] === "alto" ? u : 1 - u);
}

/** prev = [racha(t-1), racha(t-2), racha(t-3)]. Decisión 7. */
export function subnotaB2(racha: number, prev: number[] = []): number {
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

function activeWeight(
  id: VariableId,
  cobertura?: Pick<Coverage, "tieneCuotas" | "tieneLineaCredito">,
): number {
  const noDebt = cobertura !== undefined && !cobertura.tieneCuotas && !cobertura.tieneLineaCredito;
  if (noDebt && id in PARAMS.pesosVariablesSinDeuda)
    return PARAMS.pesosVariablesSinDeuda[id as "A1" | "A2"];
  if (noDebt && id.startsWith("A")) return 0;
  if (
    cobertura?.tieneCuotas &&
    !cobertura.tieneLineaCredito &&
    id in PARAMS.pesosVariablesCuotasSinLinea
  )
    return PARAMS.pesosVariablesCuotasSinLinea[
      id as keyof typeof PARAMS.pesosVariablesCuotasSinLinea
    ];
  return PARAMS.pesosVariables[id];
}

/** Agrega A-C. La aportación de grupo se calcula por separado en el orquestador. */
export function aggregate(
  vars: VariableSet,
  racha: { rachaB2Prev: number[] },
  percentiles: Percentiles,
  cobertura?: Pick<Coverage, "tieneCuotas" | "tieneLineaCredito"> &
    Partial<Pick<Coverage, "hardcoreRevolving">>,
): Aggregated {
  const contributions: Contribution[] = [];
  const subscores = { A: 0, B: 0, C: 0 };
  const confs = { A: 0, B: 0, C: 0 };
  const noDebt = cobertura !== undefined && !cobertura.tieneCuotas && !cobertura.tieneLineaCredito;
  for (const bloque of ["A", "B", "C"] as const) {
    const ids = PARAMS.bloques[bloque];
    const active = ids.filter((id) => activeWeight(id, cobertura) > 0);
    for (const id of ids) {
      const v = vars[id];
      const weight = activeWeight(id, cobertura);
      const aplicable = weight > 0;
      const rawSub =
        id === "B2"
          ? v.raw === null
            ? 50
            : subnotaB2(v.raw, racha.rachaB2Prev)
          : subnota(id, v.raw, percentiles);
      const adjustedSub =
        id === "A5" && cobertura?.hardcoreRevolving && rawSub !== null
          ? clamp(rawSub - PARAMS.hardcoreRevolving.penalizacionA5, 0, 100)
          : rawSub;
      const s = aplicable ? adjustedSub : null;
      const notaEf = s === null ? 50 : 50 + v.conf * (s - 50);
      const aportacion = aplicable ? weight * notaEf : 0;
      const health = aplicable ? sano(id, v.raw) : { umbralSano: null, sano: null };
      contributions.push({
        id,
        raw: v.raw,
        subnota: s,
        conf: aplicable ? v.conf : 1,
        peso: weight,
        pesoEfectivo: weight,
        aportacion,
        aplicable,
        ...health,
      });
      subscores[bloque] += aportacion;
      confs[bloque] += aplicable ? weight * v.conf : 0;
    }
    const activeWeightTotal = active.reduce((total, id) => total + activeWeight(id, cobertura), 0);
    if (activeWeightTotal > 0) {
      subscores[bloque] /= activeWeightTotal;
      confs[bloque] /= activeWeightTotal;
    }
    if (bloque === "A" && noDebt) confs.A = (vars.A1.conf + vars.A2.conf) / 2;
  }
  const scoreSolo = contributions.reduce((a, c) => a + c.aportacion, 0);
  const confianza = PARAMS.pesos.A * confs.A + PARAMS.pesos.B * confs.B + PARAMS.pesos.C * confs.C;
  return { contributions, subscores, confs, scoreSolo, confianza };
}

export function estadoSolo(
  scoreSolo: number,
  confianza: number,
  rachaB2: number,
  vars: VariableSet,
): Estado {
  if (confianza < PARAMS.confSinDatos) return "sin_datos";
  const A1 = vars.A1.raw;
  const C4 = vars.C4.raw;
  if (scoreSolo < PARAMS.scoreRiesgo || rachaB2 >= 2 || (C4 !== null && C4 > 0.4)) return "riesgo";
  if (
    scoreSolo >= PARAMS.scoreSana &&
    confianza >= PARAMS.confSana &&
    A1 !== null &&
    A1 >= 0.1 &&
    rachaB2 === 0 &&
    (vars.B2.raw === null || vars.B2.raw === 0) &&
    (C4 === null || C4 <= 0.2)
  )
    return "sana";
  return "vigilar";
}

export function estadoConGrupo(
  solo: Estado,
  scoreGrupo: number,
  confianza: number,
  perfil: "filial_subvencionada" | "drenaje_tesoreria" | "estandar",
  ajuste: number,
  rachaB2 = 0,
  vars?: VariableSet,
): Estado {
  if (solo === "sin_datos") return "sin_datos";
  if (solo === "riesgo")
    return ajuste > 0 && perfil === "filial_subvencionada" ? "vigilar" : "riesgo";
  const A1 = vars?.A1?.raw ?? null;
  const C4 = vars?.C4.raw ?? null;
  if (scoreGrupo < PARAMS.scoreRiesgo || rachaB2 >= 2 || (C4 !== null && C4 > 0.4)) return "riesgo";
  if (
    scoreGrupo >= PARAMS.scoreSana &&
    confianza >= PARAMS.confSana &&
    A1 !== null &&
    A1 >= 0.1 &&
    rachaB2 === 0 &&
    (vars?.B2?.raw === null || vars?.B2?.raw === 0) &&
    (C4 === null || C4 <= 0.2)
  )
    return "sana";
  return "vigilar";
}
