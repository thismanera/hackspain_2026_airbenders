import { aggregate, estado } from "@/lib/features/scoring/aggregate";
import { computeAlerts, deltas, direccion, naturaleza } from "@/lib/features/scoring/evolution";
import { groupFlows, monthlyFlows } from "@/lib/features/scoring/flows";
import { avalGrupo, groupVariables, type GroupMember } from "@/lib/features/scoring/group";
import { pairMirrors } from "@/lib/features/scoring/mirrors";
import { hashParams, PARAMS } from "@/lib/features/scoring/params";
import type {
  Company,
  Contribution,
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
import { CALENDAR, monthIndex, window } from "@/lib/features/scoring/windows";

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
  const out = new Map<string, Prepared>();
  for (const c of input.companies) {
    const txs = input.txs.filter((t) => t.company === c.id);
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

/**
 * Orquestador (§14): para cada mes del calendario calcula variables A-C y agregación de todas las
 * empresas del grupo, después las variables D y el aval (que necesitan el `score_solo` de las
 * hermanas del mismo mes) y por último evolución y alertas contra las filas ya emitidas.
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
    const stage = new Map<string, ReturnType<typeof variablesAt> & ReturnType<typeof aggregate>>();
    for (const [id, p] of prepared) {
      const v = variablesAt(p, t);
      stage.set(id, {
        ...v,
        ...aggregate(v.vars, { rachaB2Prev: v.extras.rachaB2Prev }, params.percentiles),
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
        intragrupoIn12m: s.extras.intragrupoIn12m,
        intragrupoOut12m: s.extras.intragrupoOut12m,
      });
    const gw6 = window(ghistory, t, 6);
    for (const [id, s] of stage) {
      const p = prepared.get(id)!;
      const me = members.get(id)!;
      const siblings = [...members.values()].filter(
        (m) => m.company !== id && prepared.get(m.company)!.history[t],
      );
      const d = groupVariables(me, siblings);
      const aval = avalGrupo(s.scoreSolo, d.D2, d.D3, d.D5);
      const score = Math.min(100, Math.max(0, s.scoreSolo + aval));
      const variables: Contribution[] = [
        ...s.contributions,
        {
          id: "grupo",
          raw: d.D2,
          subnota: 50,
          conf: d.confD,
          aportacion: aval,
          umbralSano: null,
          sano: null,
        },
      ];
      const prevRows = rowsBy.get(id)!;
      const prev = prevRows[t - 1];
      const three = prevRows[t - 3];
      const dir = direccion(score, three?.score ?? null);
      const nat = naturaleza(
        dir,
        prevRows.slice(-2).map((r) => r.direccion),
        variables,
        three?.variables ?? null,
      );
      const senales: Senales = {
        deterioro: dir === "deterioro",
        estructural: dir === "deterioro" && nat === "estructural",
        mejora: dir === "mejora",
        deficit: s.extras.deficitMes === true,
        impago: s.extras.rachaB2 >= 2,
        vencidoAlto: s.extras.C4 !== null && s.extras.C4 > PARAMS.vencidoAlto,
        contagio: aval <= PARAMS.alertaContagio,
        datosInsuficientes: s.confianza < PARAMS.confSinDatos,
      };
      // Una entrada de señales por empresa y mes de calendario: `computeAlerts` cuenta posiciones.
      const flags = flagsBy.get(id)!;
      const alertas = computeAlerts(senales, flags, CALENDAR.slice(0, t + 1));
      flags.push(senales);
      prevRows.push({
        company: id,
        month,
        groupId: input.groupId,
        versionParametros: params.version,
        score,
        scoreSolo: s.scoreSolo,
        avalGrupo: aval,
        confianza: s.confianza,
        subscores: s.subscores,
        confs: s.confs,
        estado: estado(score, s.confianza, s.extras.rachaB2),
        variables,
        deltaContrib: deltas(variables, prev?.variables ?? null),
        direccion: dir,
        naturaleza: nat,
        tendScore3m: three ? score - three.score : null,
        tend3m: {
          A: three ? s.subscores.A - three.subscores.A : null,
          B: three ? s.subscores.B - three.subscores.B : null,
          C: three ? s.subscores.C - three.subscores.C : null,
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
        // score_grupo consolidado (§5): pendiente de pasar `GroupFlow` por las variables A-C.
        scoreGrupo: null,
        deficitMes: s.extras.deficitMes,
        margenMes: s.extras.margenMes,
        senales,
        alertas,
        cobertura: { ...s.extras.cobertura, nHermanasConDatos: siblings.length },
      });
    }
  }
  return [...rowsBy.values()].flat();
}

export { monthIndex };
