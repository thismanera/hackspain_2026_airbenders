import { pctClasificado } from "@/lib/features/scoring/flows";
import { PARAMS, VARIABLES, type VariableId } from "@/lib/features/scoring/params";
import type { Extras, Flow, Invoice, VariableSet } from "@/lib/features/scoring/types";
import { OBLIGACIONES, type Obligacion } from "@/lib/features/scoring/types";
import { CALENDAR, divide, endOfMonth, median, sum, window } from "@/lib/features/scoring/windows";

export type VariableInput = {
  company: string;
  t: number;
  history: (Flow | undefined)[]; // indexado por CALENDAR
  invoices: Invoice[];
  scheduleMonthly: number; // cuota mensual esperada según cuadro (€), 0 si no hay
  hasLine: boolean; // tiene producto lineofcredit
};

function na(): { raw: null; conf: number } {
  return { raw: null, conf: 0 };
}
function val(raw: number | null, conf: number) {
  return raw === null || !Number.isFinite(raw) ? na() : { raw, conf };
}
function s(flows: (Flow | undefined)[], key: keyof Flow): number {
  return sum(flows.map((f) => (f ? Number(f[key]) : 0)));
}

type ObligacionStat = { recurrente: boolean; pagado: number; esperado: number; racha: number };

export function obligacionStat(
  w6: (Flow | undefined)[],
  k: Obligacion,
  scheduleMonthly: number,
): ObligacionStat {
  const amounts = w6.map((f) => (f ? f.obligaciones[k] : 0));
  const presentes = amounts.filter((a) => a > 0);
  const recurrente = presentes.length >= PARAMS.recurrenciaMin;
  if (!recurrente) return { recurrente: false, pagado: 0, esperado: 0, racha: 0 };
  const esperadoMes =
    k === "debt_repayment" && scheduleMonthly > 0 ? scheduleMonthly : median(presentes)!;
  const first = amounts.findIndex((a) => a > 0);
  const mesesEsperados = amounts.length - first;
  let racha = 0;
  for (let i = amounts.length - 1; i >= first && amounts[i] === 0; i--) racha++;
  return {
    recurrente: true,
    pagado: sum(presentes),
    esperado: esperadoMes * mesesEsperados,
    racha,
  };
}

export function rachaAt(history: (Flow | undefined)[], t: number, scheduleMonthly: number): number {
  if (t < 0) return 0;
  const w6 = window(history, t, 6);
  return Math.max(0, ...OBLIGACIONES.map((k) => obligacionStat(w6, k, scheduleMonthly).racha));
}

function paidAt(i: Invoice, end: string): boolean {
  return i.status === "paid" && !!i.paid && i.paid <= end;
}
function days(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
}
export function medianDelay(items: Invoice[]): number | null {
  return median(items.map((i) => days(i.paid, i.due)).filter((d) => Math.abs(d) <= 365));
}

export function computeVariables(input: VariableInput): { vars: VariableSet; extras: Extras } {
  const { t, history } = input;
  const w6 = window(history, t, 6);
  const w3 = window(history, t, 3);
  const w12 = window(history, t, 12);
  const nCal6 = Math.min(6, t + 1);
  const obs6 = w6.filter(Boolean).length;
  const obs12 = w12.filter(Boolean).length;
  const cVentana6 = obs6 / 6;
  const cobertura6 = pctClasificado(w6);
  const cTx = cVentana6 * cobertura6;

  const cobros6 = s(w6, "cobrosOp"),
    pagos6 = s(w6, "pagosOp");
  const caja6 = cobros6 - pagos6;
  const servicio6 = s(w6, "servicioDeuda");
  const amort6 = s(w6, "amortCredito"),
    disp6 = s(w6, "dispCredito");
  const deficitMonths = w6.filter((f) => f && f.cobrosOp < f.pagosOp).length;

  const vars = Object.fromEntries(VARIABLES.map((v) => [v, na()])) as VariableSet;
  vars.A1 = val(divide(caja6, cobros6), cTx);
  vars.A2 = val(obs6 ? deficitMonths / obs6 : null, cTx);
  vars.A3 = val(divide(caja6, servicio6), cTx);
  vars.A4 = val(divide(servicio6 + amort6, cobros6), cTx);
  vars.A5 = input.hasLine
    ? val(divide(disp6, cobros6), cTx)
    : { raw: null, conf: PARAMS.a5SinLineaConf };

  const current = history[t];
  let rachaDeficit = 0;
  for (let i = t; i >= 0 && history[i] && history[i]!.cobrosOp < history[i]!.pagosOp; i--)
    rachaDeficit++;
  const media6 = (x: number) => x / nCal6;
  const oblig6 = sum(
    w6.map((f) =>
      f
        ? f.obligaciones.tax +
          f.obligaciones.social_security +
          f.obligaciones.salary +
          f.obligaciones.debt_repayment
        : 0,
    ),
  );
  const capacidadCuotaAdv = Math.max(
    0,
    (PARAMS.estresCobros * media6(cobros6) - PARAMS.estresPagos * media6(pagos6)) /
      PARAMS.coberturaMin -
      media6(servicio6),
  );
  const extras: Extras = {
    cobrosOpMedia3m: s(w3, "cobrosOp") / Math.min(3, t + 1),
    cobrosOpMedia6m: media6(cobros6),
    pagosOpMedia6m: media6(pagos6),
    servicioDeudaMedia6m: media6(servicio6),
    amortCreditoMedia6m: media6(amort6),
    obligacionesRecMedia6m: media6(oblig6),
    capacidadCuotaAdv,
    cobrosOp12m: s(w12, "cobrosOp"),
    pagosOp12m: s(w12, "pagosOp"),
    intragrupoIn12m: s(w12, "intragrupoIn"),
    intragrupoOut12m: s(w12, "intragrupoOut"),
    rachaB2: 0,
    rachaB2Prev: [0, 0, 0],
    rachaDeficit,
    C3dias: null,
    C4: null,
    deficitMes: current ? current.cobrosOp < current.pagosOp : null,
    margenMes: current ? divide(current.cobrosOp - current.pagosOp, current.cobrosOp) : null,
    cobertura: {
      mesesObs6m: obs6,
      mesesObs12m: obs12,
      pctClasificado6m: cobertura6,
      nFacturasCli6m: 0,
      nFacturasProv6m: 0,
      tieneLineaCredito: input.hasLine,
      tieneCuotas: servicio6 > 0,
      C4Estimado: true,
    },
  };

  // ---- Bloque B
  const stats = OBLIGACIONES.map((k) => obligacionStat(w6, k, input.scheduleMonthly)).filter(
    (o) => o.recurrente,
  );
  const esperadoTotal = sum(stats.map((o) => o.esperado));
  const rachaB2 = stats.length ? Math.max(...stats.map((o) => o.racha)) : 0;
  vars.B1 = stats.length
    ? val(Math.min(1, sum(stats.map((o) => o.pagado)) / esperadoTotal), cTx)
    : na();
  vars.B2 = stats.length ? val(rachaB2, cVentana6) : na();
  const end = endOfMonth(CALENDAR[t]);
  const start6 = `${CALENDAR[Math.max(0, t - 5)]}-01`;
  const eligible = input.invoices.filter((i) => i.issued <= end);
  const paidSupplier = eligible.filter((i) => i.amount < 0 && paidAt(i, end) && i.paid >= start6);
  vars.B3 = val(medianDelay(paidSupplier), Math.min(1, paidSupplier.length / PARAMS.nFacturasRef));
  extras.rachaB2 = rachaB2;
  extras.rachaB2Prev = [1, 2, 3].map((k) => rachaAt(history, t - k, input.scheduleMonthly));
  extras.cobertura.nFacturasProv6m = paidSupplier.length;

  // ---- Bloque C (Tarea 8): insertar aquí

  return { vars, extras };
}
