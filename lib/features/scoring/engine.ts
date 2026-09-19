import {
  aggregate,
  estadoConGrupo,
  estadoSolo,
  type Aggregated,
} from "@/lib/features/scoring/aggregate";
import {
  computeAlerts,
  diagnosticoMejora,
  detectarInflexion,
  deltas,
  direccion,
  factorDeterminante,
  naturaleza,
} from "@/lib/features/scoring/evolution";
import { groupFlows, monthlyFlows } from "@/lib/features/scoring/flows";
import {
  ajusteHolding,
  groupVariables,
  perfilGrupo,
  type GroupMember,
} from "@/lib/features/scoring/group";
import { pairMirrors } from "@/lib/features/scoring/mirrors";
import { hashParams, PARAMS } from "@/lib/features/scoring/params";
import type {
  Company,
  Flow,
  GroupFlow,
  Invoice,
  Parameters,
  Product,
  ScoreRow,
  Senales,
  Tx,
} from "@/lib/features/scoring/types";
import { computeVariables, type VariableInput } from "@/lib/features/scoring/variables";
import { CALENDAR, window } from "@/lib/features/scoring/windows";

export type GroupInput = {
  groupId: string;
  companies: Company[];
  /** Todos los movimientos booked del grupo, importes en € (o null si no convertible). */
  txs: Tx[];
  invoices: Map<string, Invoice[]>;
  /** Cuota mensual esperada por empresa según cuadro de amortización. */
  schedule: Map<string, number>;
  products: Map<string, Product>;
};

export type Prepared = {
  company: Company;
  /** Flujo mensual indexado por `CALENDAR`; `undefined` donde la empresa no tiene movimientos. */
  history: (Flow | undefined)[];
  invoices: Invoice[];
  scheduleMonthly: number;
  hasLine: boolean;
  tienePrestamoIntragrupo: boolean;
};

/**
 * Primera etapa del pipeline (§14): los espejos se emparejan una sola vez sobre todo el grupo (solo
 * cuentas operativas, de ahí el `products`) y de ahí sale el histórico mensual de cada empresa.
 */
export function prepareGroup(input: GroupInput): Map<string, Prepared> {
  const mirrors = pairMirrors(input.txs, input.products);
  const byCompany = new Map<string, Tx[]>(input.companies.map((c) => [c.id, []]));
  for (const t of input.txs) byCompany.get(t.company)?.push(t);
  const out = new Map<string, Prepared>();
  for (const c of input.companies) {
    const txs = byCompany.get(c.id)!;
    const own = [...input.products.values()].filter((p) => p.company === c.id);
    const hasLine = own.some((p) => p.type === "lineofcredit");
    const flows = monthlyFlows(c.id, txs, input.products, mirrors, hasLine);
    out.set(c.id, {
      company: c,
      history: CALENDAR.map((m) => flows.get(m)),
      invoices: input.invoices.get(c.id) ?? [],
      scheduleMonthly: input.schedule.get(c.id) ?? 0,
      hasLine,
      // Los préstamos intragrupo `custom` no tienen serie mensual: solo levantan el flag (§5).
      tienePrestamoIntragrupo: own.some((p) => p.service === "custom"),
    });
  }
  return out;
}

/** Variables A-C más su agregación: lo que cada empresa aporta a la segunda pasada del mes. */
type Staged = ReturnType<typeof computeVariables> & Aggregated;

export function variablesAt(p: Prepared, t: number): ReturnType<typeof computeVariables> {
  const input: VariableInput = {
    company: p.company.id,
    t,
    history: p.history,
    invoices: p.invoices,
    scheduleMonthly: p.scheduleMonthly,
    hasLine: p.hasLine,
  };
  return computeVariables(input);
}

/** Media sobre los meses de calendario transcurridos, no sobre los meses con dato. */
function media6(
  flows: (GroupFlow | undefined)[],
  key: "cobrosOp" | "pagosOp" | "servicioDeuda",
  t: number,
): number {
  return flows.reduce((a, f) => a + (f ? f[key] : 0), 0) / Math.min(6, t + 1);
}

function signChanges(values: (number | null)[]): number {
  let changes = 0;
  let previous: number | null = null;
  for (const value of values) {
    if (value === null || value === 0) {
      previous = null;
      continue;
    }
    const current = Math.sign(value);
    if (previous !== null && current !== previous) changes++;
    previous = current;
  }
  return changes;
}

function factorForGroup(
  current: number,
  previous: number | null,
  autonomous: { id: string; delta: number }[],
) {
  const delta = previous === null ? 0 : current - previous;
  const candidates = [...autonomous, { id: "holding", delta }];
  if (candidates.every((candidate) => candidate.delta === 0))
    return { id: "sin_datos", delta: 0, descripcion: "Sin comparación mensual disponible" };
  const winner = [...candidates].sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.id.localeCompare(b.id),
  )[0];
  return winner
    ? {
        ...winner,
        descripcion:
          winner.id === "holding"
            ? winner.delta === 0
              ? "Sin cambio de ajuste del holding"
              : `El holding ${winner.delta > 0 ? "apoya" : "contagia"} este mes`
            : `${winner.id} cambia la aportación de la nota dentro del holding`,
      }
    : { id: "holding", delta: 0, descripcion: "Sin comparación disponible" };
}

function earlyWarning(
  scoreSolo: number,
  previous: ScoreRow | undefined,
  previousRows: ScoreRow[],
  deficitMes: boolean | null,
  rachaDeficit: number,
  c4: number | null,
  c6: number | null,
): boolean {
  if (previous && scoreSolo - previous.scoreSolo <= -4) return true;
  const healthyRun =
    previousRows.slice(-4).length === 4 &&
    previousRows.slice(-4).every((r) => r.margenMes !== null && r.margenMes > 0);
  if (deficitMes === true && rachaDeficit === 1 && healthyRun) return true;
  if (previous && c4 !== null && previous.C4 !== null && c4 - previous.C4 > 0.15) return true;
  return c6 !== null && c6 > 0;
}

function trajectory(
  current: ScoreRow,
  previous: ScoreRow | undefined,
  three: ScoreRow | undefined,
  c5: number | null,
  c5P80: number | null | undefined,
  history: (Flow | undefined)[],
  t: number,
): ScoreRow["patronTrayectoria"] {
  const structural =
    current.direccion === "deterioro" &&
    previous?.direccion === "deterioro" &&
    previous !== undefined &&
    three !== undefined &&
    current.variables
      .filter((c) => c.id.startsWith("A") && c.aplicable)
      .filter((c) => {
        const before = three.variables.find((x) => x.id === c.id);
        return (
          before !== undefined && before.aportacion - c.aportacion >= PARAMS.deltaAportacionMin
        );
      }).length >= PARAMS.minVariablesEstructural;
  if (structural) return "caida_estructural";
  const net = window(history, t, 6).map((f) => (f?.observed ? f.cobrosOp - f.pagosOp : null));
  if (
    c5 !== null &&
    c5P80 != null &&
    c5 > c5P80 &&
    net.length === 6 &&
    net.every((value) => value !== null && value !== 0) &&
    signChanges(net) >= 3
  )
    return "inestabilidad_cronica";
  if (
    previous &&
    current.scoreSolo - previous.scoreSolo <= -5 &&
    previous.scoreSolo >= 65 &&
    current.rachaDeficit <= 1 &&
    current.rachaB2 === 0
  )
    return "bache_puntual";
  if (current.direccion === "mejora") return "mejora";
  return current.direccion === "estable" ? "estable" : "estable";
}

/**
 * Orquestador (§14): para cada mes del calendario calcula variables A-C y agregación de todas las
 * empresas del grupo, después las variables D y el aval (que necesitan el `scoreSolo` de las
 * hermanas del mismo mes) y por último evolución y alertas sobre la nota autónoma.
 */
export function scoreGroup(input: GroupInput, params: Parameters): ScoreRow[] {
  if (params.paramsHash !== hashParams(PARAMS))
    throw new Error("frozen parameters do not match PARAMS");
  const prepared = prepareGroup(input);
  const gflows = groupFlows(
    [...prepared.values()].map(
      (p) => new Map(p.history.filter((f): f is Flow => !!f).map((f) => [f.month, f])),
    ),
  );
  const ghistory = CALENDAR.map((m) => gflows.get(m));
  const rowsBy = new Map<string, ScoreRow[]>([...prepared.keys()].map((id) => [id, []]));
  const flagsBy = new Map<string, Senales[]>([...prepared.keys()].map((id) => [id, []]));

  for (let t = 0; t < CALENDAR.length; t++) {
    const month = CALENDAR[t];
    const stage = new Map<string, Staged>();
    for (const [id, p] of prepared) {
      const v = variablesAt(p, t);
      stage.set(id, {
        ...v,
        ...aggregate(
          v.vars,
          { rachaB2Prev: v.extras.rachaB2Prev },
          params.percentiles,
          v.extras.cobertura,
        ),
      });
    }
    const members = new Map<string, GroupMember>();
    for (const [id, s] of stage)
      members.set(id, {
        company: id,
        scoreSolo: s.scoreSolo,
        confianza: s.confianza,
        cobrosOp12m: s.extras.cobrosOp12m,
        pagosOp12m: s.extras.pagosOp12m,
        capacidadCuotaAdv: s.extras.capacidadCuotaAdv,
        obligacionesMedia6m: s.extras.servicioDeudaMedia6m + s.extras.obligacionesRecMedia6m,
        cobrosOpMedia6m: s.extras.cobrosOpMedia6m,
        pagosOpMedia6m: s.extras.pagosOpMedia6m,
        servicioDeudaMedia6m: s.extras.servicioDeudaMedia6m,
        capacidadNeta6m:
          s.extras.cobrosOpMedia6m - s.extras.pagosOpMedia6m - s.extras.servicioDeudaMedia6m,
        intragrupoIn12m: s.extras.intragrupoIn12m,
        intragrupoOut12m: s.extras.intragrupoOut12m,
        A1: s.vars.A1.raw,
        margenMes: s.extras.margenMes,
        rachaB2: s.extras.rachaB2,
        b2Observed: s.vars.B2.raw !== null,
      });
    const gw6 = window(ghistory, t, 6);
    // Hermanas = miembros con evidencia de 12 meses en `t`, no con fila en `t` (§14): un mes vacío
    // suelto no puede sacar a una hermana del grupo y hacer parpadear D1-D5 y el aval.
    const conEvidencia = [...members.values()].filter(
      (m) => m.cobrosOp12m > 0 || m.confianza >= PARAMS.confSinDatos,
    );
    for (const [id, s] of stage) {
      const p = prepared.get(id)!;
      const me = members.get(id)!;
      // Quien queda fuera tiene `cobrosOp12m === 0`, así que el denominador de D1 sobre esta lista
      // sigue siendo el total de cobros del grupo.
      const siblings = conEvidencia.filter((m) => m.company !== id);
      const d = groupVariables(me, siblings);
      const profile = perfilGrupo(
        me.capacidadNeta6m ?? 0,
        me.A1,
        me.capacidadNeta6m,
        d.D2,
        d.D4,
        me.rachaB2,
        me.b2Observed,
      );
      const ajusteBase = ajusteHolding(me, siblings, d.D2, d.D5);
      const scoreGrupo = Math.min(100, Math.max(0, s.scoreSolo + ajusteBase));
      const ajuste = scoreGrupo - s.scoreSolo;
      const variables = s.contributions;
      const prevRows = rowsBy.get(id)!;
      const prev = prevRows[t - 1];
      const three = prevRows[t - 3];
      const six = prevRows[t - 6];
      const twelve = prevRows[t - 12];
      const dir = direccion(s.scoreSolo, three?.scoreSolo ?? null, six?.scoreSolo ?? null);
      const nat = naturaleza(
        dir,
        prevRows.slice(-2).map((r) => r.direccion),
        variables,
        three?.variables ?? null,
      );
      const estadoSoloActual = estadoSolo(s.scoreSolo, s.confianza, s.extras.rachaB2, s.vars);
      const estadoActual = estadoConGrupo(
        estadoSoloActual,
        scoreGrupo,
        s.confianza,
        profile,
        ajuste,
        s.extras.rachaB2,
        s.vars,
      );
      const c6 = s.vars.C6.raw;
      const alertaTemprana = earlyWarning(
        s.scoreSolo,
        prev,
        prevRows,
        s.extras.deficitMes,
        s.extras.rachaDeficit,
        s.extras.C4,
        c6,
      );
      const senales: Senales = {
        deterioro: dir === "deterioro",
        estructural: dir === "deterioro" && nat === "estructural",
        mejora: dir === "mejora",
        deficit: s.extras.deficitMes === true,
        impago: s.extras.rachaB2 >= 2,
        vencidoAlto: s.extras.C4 !== null && s.extras.C4 > PARAMS.vencidoAlto,
        contagio: ajuste <= PARAMS.alertaContagio,
        datosInsuficientes: s.confianza < PARAMS.confSinDatos,
        alertaTempranaDeterioro: alertaTemprana,
      };
      // Una entrada de señales por empresa y mes de calendario: `computeAlerts` cuenta posiciones.
      const flags = flagsBy.get(id)!;
      const alertas = computeAlerts(senales, flags, CALENDAR.slice(0, t + 1));
      flags.push(senales);
      const deltaContrib = deltas(variables, prev?.variables ?? null);
      const factor = factorDeterminante(deltaContrib);
      const aportacionGrupo = ajuste;
      const factorGrupo = factorForGroup(
        aportacionGrupo,
        prev?.aportacionGrupo ?? null,
        deltaContrib,
      );
      const row: ScoreRow = {
        company: id,
        month,
        groupId: input.groupId,
        versionParametros: params.version,
        scoreSolo: s.scoreSolo,
        ajusteHolding: ajuste,
        aportacionGrupo,
        deltaGrupo: factorGrupo.delta,
        confianza: s.confianza,
        subscores: s.subscores,
        confs: s.confs,
        estadoSolo: estadoSoloActual,
        estadoGrupo: estadoActual,
        perfilGrupo: profile,
        variables,
        deltaContrib,
        direccion: dir,
        naturaleza: nat,
        patronTrayectoria: "estable",
        tendScore3m: three ? s.scoreSolo - three.scoreSolo : null,
        tendScore6m: six ? s.scoreSolo - six.scoreSolo : null,
        tendScore12m: twelve ? s.scoreSolo - twelve.scoreSolo : null,
        tend3m: {
          A: three ? s.subscores.A - three.subscores.A : null,
          B: three ? s.subscores.B - three.subscores.B : null,
          C: three ? s.subscores.C - three.subscores.C : null,
        },
        alertaTempranaDeterioro: alertaTemprana,
        factorDeterminante: factor,
        factorDeterminanteGrupo: factorGrupo,
        canarioEnMina: { detectado: false, id: null, mensaje: null },
        diagnosticoMejora: { confirmada: false, motor: null },
        inflexion: {
          hayInflexion: false,
          tipo: "sin_inflexion",
          mesInflexion: null,
          antelacionMeses: 0,
          scoreInflexion: null,
          canalDesencadenante: "ninguno",
          variableDetonante: null,
          explicacion: "Sin historial suficiente",
        },
        inflexionGrupo: {
          hayInflexion: false,
          tipo: "sin_inflexion",
          mesInflexion: null,
          antelacionMeses: 0,
          scoreInflexion: null,
          canalDesencadenante: "ninguno",
          variableDetonante: null,
          explicacion: "Sin historial suficiente",
        },
        rachaB2: s.extras.rachaB2,
        rachaDeficit: s.extras.rachaDeficit,
        C3dias: s.extras.C3dias,
        C4: s.extras.C4,
        cobrosOpMedia3m: s.extras.cobrosOpMedia3m,
        cobrosOpMedia6m: s.extras.cobrosOpMedia6m,
        pagosOpMedia6m: s.extras.pagosOpMedia6m,
        servicioDeudaMedia6m: s.extras.servicioDeudaMedia6m,
        amortCreditoMedia6m: s.extras.amortCreditoMedia6m,
        obligacionesRecMedia6m: s.extras.obligacionesRecMedia6m,
        capacidadCuotaAdv: s.extras.capacidadCuotaAdv,
        D1: d.D1,
        D2: d.D2,
        D3: d.D3,
        D4: d.D4,
        D5: d.D5,
        confD: d.confD,
        tienePrestamoIntragrupo: p.tienePrestamoIntragrupo,
        cobrosOpGrupoMedia6m: media6(gw6, "cobrosOp", t),
        pagosOpGrupoMedia6m: media6(gw6, "pagosOp", t),
        servicioDeudaGrupoMedia6m: media6(gw6, "servicioDeuda", t),
        scoreGrupo,
        deficitMes: s.extras.deficitMes,
        margenMes: s.extras.margenMes,
        senales,
        alertas,
        cobertura: { ...s.extras.cobertura, nHermanasConDatos: siblings.length },
      };
      row.patronTrayectoria = trajectory(
        row,
        prev,
        three,
        s.vars.C5.raw,
        params.c5P80,
        p.history,
        t,
      );
      const previousVariable = prev?.variables.find((c) => c.id === "B2");
      const currentB2 = variables.find((c) => c.id === "B2");
      const previousC6 = prev?.variables.find((c) => c.id === "C6");
      const currentC6 = variables.find((c) => c.id === "C6");
      const canary = [
        previousVariable &&
        currentB2 &&
        previousVariable.subnota !== null &&
        currentB2.subnota !== null
          ? { id: "B2", delta: currentB2.subnota - previousVariable.subnota }
          : null,
        previousC6 && currentC6 && previousC6.subnota !== null && currentC6.subnota !== null
          ? { id: "C6", delta: currentC6.subnota - previousC6.subnota }
          : null,
      ].find((x): x is { id: string; delta: number } => x !== null && x.delta < -30);
      row.canarioEnMina = canary
        ? {
            detectado: true,
            id: canary.id,
            mensaje: `${canary.id} cae más de 30 puntos aunque el score global pueda moverse poco`,
          }
        : { detectado: false, id: null, mensaje: null };
      row.diagnosticoMejora = diagnosticoMejora(row, prev ?? null, three ?? null, [
        ...prevRows.slice(-2),
        row,
      ]);
      row.inflexion = detectarInflexion([...prevRows, row], false);
      row.inflexionGrupo = detectarInflexion([...prevRows, row], true);
      prevRows.push(row);
    }
  }
  return [...rowsBy.values()].flat();
}
