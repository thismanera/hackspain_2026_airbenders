import { PARAMS } from "@/lib/features/scoring/params";
import type {
  Alert,
  AlertTipo,
  Contribution,
  Direccion,
  FactorDeterminante,
  DiagnosticoMejora,
  InflexionResult,
  CanalDesencadenante,
  Naturaleza,
  Senales,
} from "@/lib/features/scoring/types";

export function direccion(
  score: number,
  score3: number | null,
  score6: number | null = null,
): Direccion {
  if (score3 === null) return "estable";
  const d = score - score3;
  const d6 = score6 === null ? null : score - score6;
  if (d6 !== null && d !== 0 && d6 !== 0 && Math.sign(d) !== Math.sign(d6)) return "estable";
  if (d >= PARAMS.umbralDireccion) return "mejora";
  if (d <= -PARAMS.umbralDireccion) return "deterioro";
  return "estable";
}

export function factorDeterminante(deltas: { id: string; delta: number }[]): FactorDeterminante {
  const winner = [...deltas].sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.id.localeCompare(b.id),
  )[0];
  if (!winner || deltas.every((item) => item.delta === 0))
    return { id: "sin_datos", delta: 0, descripcion: "Sin comparación mensual disponible" };
  return {
    ...winner,
    descripcion: `${winner.id} ${winner.delta >= 0 ? "mejora" : "deteriora"} la aportación autónoma`,
  };
}

const NIVEL = new Set(["A1", "A2", "A3"]);

/**
 * `dirPrev`: direcciones de los meses anteriores en orden cronológico (la más reciente al final).
 * Para que un movimiento sea estructural la dirección debe repetirse `PARAMS.persistenciaEstructural`
 * meses seguidos contando el actual, es decir los últimos `persistenciaEstructural − 1` elementos de
 * `dirPrev` deben coincidir con `dir` (con el valor 2 actual: el mes anterior).
 */
export function naturaleza(
  dir: Direccion,
  dirPrev: Direccion[],
  contributions: Contribution[],
  contributions3: Contribution[] | null,
): Naturaleza {
  if (dir === "estable") return "sin_cambio";
  const necesarios = PARAMS.persistenciaEstructural - 1;
  const recientes = necesarios > 0 ? dirPrev.slice(-necesarios) : [];
  if (recientes.length < necesarios || !recientes.every((d) => d === dir) || !contributions3)
    return "temporal";
  const sign = dir === "mejora" ? 1 : -1;
  const moved = contributions.filter((c) => {
    const before = contributions3.find((x) => x.id === c.id);
    return before && sign * (c.aportacion - before.aportacion) >= PARAMS.deltaAportacionMin;
  });
  return moved.length >= PARAMS.minVariablesEstructural && moved.some((c) => NIVEL.has(c.id))
    ? "estructural"
    : "temporal";
}

export function deltas(
  now: Contribution[],
  prev: Contribution[] | null,
): { id: Contribution["id"]; delta: number }[] {
  return now.map((c) => ({
    id: c.id,
    delta: c.aportacion - (prev?.find((p) => p.id === c.id)?.aportacion ?? c.aportacion),
  }));
}

export function diagnosticoMejora(
  current: { scoreSolo: number; tendScore3m: number | null; variables: Contribution[] },
  previous: { scoreSolo: number; variables: Contribution[] } | null,
  three: { variables: Contribution[] } | null,
  recent: { scoreSolo: number }[] = [],
): DiagnosticoMejora {
  if (!previous || !three || current.tendScore3m === null || current.tendScore3m < 6)
    return { confirmada: false, motor: null };
  if (
    current.scoreSolo < previous.scoreSolo ||
    recent.some((row, index) => index > 0 && row.scoreSolo < recent[index - 1].scoreSolo)
  )
    return { confirmada: false, motor: null };
  const candidates = current.variables
    .filter((c) => c.id === "A1" || c.id === "A2")
    .map((c) => ({
      id: c.id,
      delta:
        c.aportacion - (three.variables.find((x) => x.id === c.id)?.aportacion ?? c.aportacion),
    }))
    .filter((x) => x.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.id.localeCompare(b.id));
  return candidates.length
    ? { confirmada: true, motor: candidates[0].id }
    : { confirmada: false, motor: null };
}

function monthNumber(month: string): number {
  const [year, mon] = month.split("-").map(Number);
  return year * 12 + mon;
}

function channelFor(id: string): CanalDesencadenante {
  if (id === "holding") return "holding";
  if (id === "C1" || id === "C2" || id === "C3" || id === "C4" || id === "C5" || id === "C6")
    return "comercial";
  if (id === "A1" || id === "A2") return "operativo";
  return "financiero";
}

type InflexionRow = {
  month: string;
  scoreSolo: number;
  scoreGrupo: number;
  aportacionGrupo: number;
  variables: Contribution[];
};

function contributionValue(row: InflexionRow, id: string, includeHolding: boolean): number | null {
  if (id === "holding") return includeHolding ? row.aportacionGrupo : null;
  return row.variables.find((c) => c.id === id)?.aportacion ?? null;
}

/** Detecta un giro confirmado en los seis meses anteriores al mes actual. */
export function detectarInflexion(rows: InflexionRow[], includeHolding: boolean): InflexionResult {
  if (rows.length < 3)
    return {
      hayInflexion: false,
      tipo: "sin_inflexion",
      mesInflexion: null,
      antelacionMeses: 0,
      scoreInflexion: null,
      canalDesencadenante: "ninguno",
      variableDetonante: null,
      explicacion: "Sin historial suficiente para confirmar una inflexión",
    };
  const current = rows[rows.length - 1];
  const scoreOf = (row: InflexionRow): number => (includeHolding ? row.scoreGrupo : row.scoreSolo);
  const candidates = rows.slice(Math.max(0, rows.length - 7), -1);
  const check = (up: boolean): InflexionResult | null => {
    const scored = candidates
      .map((row, offset) => ({ row, index: Math.max(0, rows.length - 7) + offset }))
      .filter(({ row }) => typeof scoreOf(row) === "number")
      .sort(
        (a, b) =>
          (up ? scoreOf(a.row) - scoreOf(b.row) : scoreOf(b.row) - scoreOf(a.row)) ||
          b.index - a.index,
      );
    const candidate = scored[0];
    if (!candidate) return null;
    const after = rows.slice(candidate.index + 1);
    if (after.length < 2) return null;
    const sequence = [candidate.row, ...after];
    let valid = true;
    for (let i = 1; i < sequence.length; i++) {
      if (monthNumber(sequence[i].month) !== monthNumber(sequence[i - 1].month) + 1) {
        valid = false;
        break;
      }
    }
    const extreme = scoreOf(candidate.row);
    const currentScore = scoreOf(current);
    const regime = after.every((row) => {
      const score = scoreOf(row);
      return up ? score >= extreme - 1 : score <= extreme + 1;
    });
    if (!valid || !regime || (up ? currentScore < extreme + 6 : currentScore > extreme - 6))
      return null;
    const first = rows[candidate.index + 1];
    const ids = includeHolding
      ? [...PARAMS.bloques.A, ...PARAMS.bloques.B, ...PARAMS.bloques.C, "holding"]
      : [...PARAMS.bloques.A, ...PARAMS.bloques.B, ...PARAMS.bloques.C];
    const changes = ids.map((id) => ({
      id,
      delta:
        (contributionValue(first, id, includeHolding) ?? 0) -
        (contributionValue(candidate.row, id, includeHolding) ?? 0),
    }));
    const trigger = [...changes].sort(
      (a, b) => (up ? b.delta - a.delta : a.delta - b.delta) || a.id.localeCompare(b.id),
    )[0];
    const tipo = up ? "suelo_alcista" : "pico_bajista";
    return {
      hayInflexion: true,
      tipo,
      mesInflexion: candidate.row.month,
      antelacionMeses: monthNumber(current.month) - monthNumber(candidate.row.month),
      scoreInflexion: scoreOf(candidate.row),
      canalDesencadenante: channelFor(trigger.id),
      variableDetonante: trigger.id,
      explicacion: `Giro ${up ? "alcista" : "bajista"} confirmado; primer detonante observado: ${trigger.id}`,
    };
  };
  return (
    check(false) ??
    check(true) ?? {
      hayInflexion: false,
      tipo: "sin_inflexion",
      mesInflexion: null,
      antelacionMeses: 0,
      scoreInflexion: null,
      canalDesencadenante: "ninguno",
      variableDetonante: null,
      explicacion: "No hay giro confirmado con régimen sostenido y distancia suficiente",
    }
  );
}

const RULES: { tipo: AlertTipo; flag: keyof Senales; meses: number }[] = [
  { tipo: "deterioro", flag: "deterioro", meses: 2 },
  { tipo: "deterioro_estructural", flag: "estructural", meses: 1 },
  { tipo: "recuperacion", flag: "mejora", meses: 2 },
  { tipo: "deficit_persistente", flag: "deficit", meses: 3 },
  { tipo: "impago_obligaciones", flag: "impago", meses: 1 },
  { tipo: "vencido_alto", flag: "vencidoAlto", meses: 1 },
  { tipo: "contagio_grupo", flag: "contagio", meses: 1 },
  { tipo: "datos_insuficientes", flag: "datosInsuficientes", meses: 1 },
  { tipo: "alerta_temprana_deterioro", flag: "alertaTempranaDeterioro", meses: 1 },
];

/**
 * `prev`: señales de los meses anteriores en orden cronológico; `months`: los meses de `prev`
 * seguidos del actual. Debe haber exactamente una entrada de `Senales` por mes de calendario
 * consecutivo (sin huecos): la racha cuenta posiciones, así que un mes ausente se leería como
 * continuidad y `desdeMes` saldría desplazado.
 */
export function computeAlerts(now: Senales, prev: Senales[], months: string[]): Alert[] {
  const all = [...prev, now];
  const out: Alert[] = [];
  for (const r of RULES) {
    if (!now[r.flag]) continue;
    let run = 0;
    for (let i = all.length - 1; i >= 0 && all[i][r.flag]; i--) run++;
    if (run >= r.meses) out.push({ tipo: r.tipo, desdeMes: months[months.length - run] });
  }
  return out;
}
