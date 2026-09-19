import { pctClasificado } from "@/lib/features/scoring/flows";
import { PARAMS, VARIABLES } from "@/lib/features/scoring/params";
import type {
  Extras,
  Flow,
  Invoice,
  VariableSet,
  VariableValue,
} from "@/lib/features/scoring/types";
import { OBLIGACIONES, type Obligacion } from "@/lib/features/scoring/types";
import {
  CALENDAR,
  divide,
  endOfMonth,
  mad,
  median,
  sum,
  window,
} from "@/lib/features/scoring/windows";

export type VariableInput = {
  company: string;
  t: number;
  history: (Flow | undefined)[]; // indexado por CALENDAR
  invoices: Invoice[];
  scheduleMonthly: number; // cuota mensual esperada según cuadro (€), 0 si no hay
  hasLine: boolean; // tiene producto lineofcredit
};

type Slots = (Flow | undefined)[];
type NumericFlowKey = { [K in keyof Flow]-?: Flow[K] extends number ? K : never }[keyof Flow];

/** Contexto común: las tres ventanas y sus confianzas, calculado una sola vez por empresa-mes. */
type Ctx = {
  t: number;
  history: Slots;
  w3: Slots;
  w6: Slots;
  w12: Slots;
  obs6: number;
  obs12: number;
  nCal6: number;
  cVentana6: number;
  cobertura6: number;
  cobertura12: number;
  cTx: number;
};

type Block = {
  vars: Partial<VariableSet>;
  extras: Partial<Extras>;
  cobertura?: Partial<Extras["cobertura"]>;
};

function na(): VariableValue {
  return { raw: null, conf: 0 };
}
function val(raw: number | null, conf: number): VariableValue {
  return raw === null || !Number.isFinite(raw) ? na() : { raw, conf };
}
function s(flows: Slots, key: NumericFlowKey): number {
  return sum(flows.map((f) => (f ? f[key] : 0)));
}

type ObligacionStat = { recurrente: boolean; pagado: number; esperado: number; racha: number };

/**
 * Un mes sin fila (o sin ningún movimiento clasificable) es "sin dato": no cuenta como mes esperado
 * y rompe la racha, igual que `racha_deficit` (§5.2).
 */
export function obligacionStat(w6: Slots, k: Obligacion, scheduleMonthly: number): ObligacionStat {
  const amounts = w6.map((f) => (f?.observed ? f.obligaciones[k] : null));
  const presentes = amounts.filter((a): a is number => a !== null && a > 0);
  const recurrente = presentes.length >= PARAMS.recurrenciaMin;
  if (!recurrente) return { recurrente: false, pagado: 0, esperado: 0, racha: 0 };
  const esperadoMes =
    k === "debt_repayment" && scheduleMonthly > 0 ? scheduleMonthly : median(presentes)!;
  const first = amounts.findIndex((a) => a !== null && a > 0);
  const mesesEsperados = amounts.slice(first).filter((a) => a !== null).length;
  let racha = 0;
  for (let i = amounts.length - 1; i >= first && amounts[i] === 0; i--) racha++;
  return {
    recurrente: true,
    pagado: sum(presentes),
    esperado: esperadoMes * mesesEsperados,
    racha,
  };
}

export function rachaAt(history: Slots, t: number, scheduleMonthly: number): number {
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

/** Mediana de retraso y nº de facturas que sobreviven al guardia de |retraso| ≤ 365 días. */
export type Delay = { value: number | null; n: number };

export function medianDelay(items: Invoice[]): Delay {
  const delays = items.map((i) => days(i.paid, i.due)).filter((d) => Math.abs(d) <= 365);
  return { value: median(delays), n: delays.length };
}

type InvoiceWindow = { end: string; start6: string; eligible: Invoice[] };

/** Regla de oro: solo facturas emitidas hasta fin(t). `start6` abre la ventana de 6 meses. */
export function invoiceWindow(t: number, invoices: Invoice[]): InvoiceWindow {
  const end = endOfMonth(CALENDAR[t]);
  const start6 = `${CALENDAR[Math.max(0, t - 5)]}-01`;
  return { end, start6, eligible: invoices.filter((i) => i.issued <= end) };
}

function blockA(ctx: Ctx, hasLine: boolean, scheduleMonthly: number): Block {
  const { w3, w6, w12, cTx, nCal6 } = ctx;
  const cobros6 = s(w6, "cobrosOp"),
    pagos6 = s(w6, "pagosOp");
  const caja6 = cobros6 - pagos6;
  const servicio6 = s(w6, "servicioDeuda");
  const amort6 = s(w6, "amortCredito"),
    disp6 = s(w6, "dispCredito");
  const deficitMonths = w6.filter((f) => f?.observed && f.cobrosOp < f.pagosOp).length;
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
  let rachaDeficit = 0;
  for (
    let i = ctx.t;
    i >= 0 && ctx.history[i]?.observed && ctx.history[i]!.cobrosOp < ctx.history[i]!.pagosOp;
    i--
  )
    rachaDeficit++;
  const current = ctx.history[ctx.t];
  const observed6 = w6.filter((f) => f?.observed);
  const hardcoreRevolving =
    hasLine &&
    observed6.length >= PARAMS.hardcoreRevolving.minMesesObservados &&
    observed6.every((f) => f!.dispCredito > 0) &&
    observed6.every((f) => f!.amortCredito === 0);
  return {
    vars: {
      A1: val(divide(caja6, cobros6), cTx),
      A2: val(ctx.obs6 ? deficitMonths / ctx.obs6 : null, cTx),
      A3: val(divide(caja6, servicio6), cTx),
      A4: val(divide(servicio6 + amort6, cobros6), cTx),
      A5: hasLine ? val(divide(disp6, cobros6), cTx) : { raw: null, conf: PARAMS.a5SinLineaConf },
    },
    extras: {
      cobrosOpMedia3m: s(w3, "cobrosOp") / Math.min(3, ctx.t + 1),
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
      rachaDeficit,
      deficitMes: current?.observed ? current.cobrosOp < current.pagosOp : null,
      margenMes: current?.observed
        ? divide(current.cobrosOp - current.pagosOp, current.cobrosOp)
        : null,
    },
    cobertura: {
      tieneCuotas: servicio6 > 0 || scheduleMonthly > 0,
      hardcoreRevolving,
    },
  };
}

function blockB(ctx: Ctx, inv: InvoiceWindow, scheduleMonthly: number): Block {
  const stats = OBLIGACIONES.map((k) => obligacionStat(ctx.w6, k, scheduleMonthly)).filter(
    (o) => o.recurrente,
  );
  const esperadoTotal = sum(stats.map((o) => o.esperado));
  const rachaB2 = stats.length ? Math.max(...stats.map((o) => o.racha)) : 0;
  const paidSupplier = inv.eligible.filter(
    (i) => i.amount < 0 && paidAt(i, inv.end) && i.paid >= inv.start6,
  );
  const b3 = medianDelay(paidSupplier);
  return {
    vars: {
      B1: stats.length
        ? val(Math.min(1, sum(stats.map((o) => o.pagado)) / esperadoTotal), ctx.cTx)
        : na(),
      B2: stats.length ? val(rachaB2, ctx.cTx) : na(),
      B3: val(b3.value, Math.min(1, b3.n / PARAMS.nFacturasRef)),
    },
    extras: {
      rachaB2,
      rachaB2Prev: [1, 2, 3].map((k) => rachaAt(ctx.history, ctx.t - k, scheduleMonthly)),
    },
    cobertura: { nFacturasProv6m: paidSupplier.length },
  };
}

function top3Share(
  ctx: Ctx,
  key: "cobrosPorContraparte" | "pagosPorContraparte",
  total: number,
): VariableValue {
  const by: Record<string, number> = {};
  for (const f of ctx.w12)
    if (f?.observed) for (const [cp, a] of Object.entries(f[key])) by[cp] = (by[cp] ?? 0) + a;
  const vals = Object.values(by).sort((a, b) => b - a);
  const identificado = sum(vals);
  // `identificado` y `total` suman los mismos importes en distinto orden, así que el cociente puede
  // pasarse de 1 por un ULP cuando toda la contraparte está identificada: la confianza se recorta.
  return val(
    divide(sum(vals.slice(0, 3)), identificado),
    Math.min(1, (ctx.obs12 / 12) * (total > 0 ? identificado / total : 0)),
  );
}

function blockC(ctx: Ctx, inv: InvoiceWindow, cobrosOp12m: number, pagosOp12m: number): Block {
  const client = inv.eligible.filter((i) => i.amount > 0);
  const paidClient = client.filter((i) => paidAt(i, inv.end) && i.paid >= inv.start6);
  const dueClient = client.filter((i) => i.due >= inv.start6 && i.due <= inv.end);
  const vencido = divide(
    sum(dueClient.filter((i) => !paidAt(i, inv.end)).map((i) => i.amount)),
    sum(dueClient.map((i) => i.amount)),
  );
  const c3 = medianDelay(paidClient);
  const obsCobros = ctx.w12.filter((f): f is Flow => !!f?.observed).map((f) => f.cobrosOp);
  const med = obsCobros.length >= PARAMS.minObsVolatilidad ? median(obsCobros) : null;
  const C3 = val(c3.value, Math.min(1, c3.n / PARAMS.nFacturasRef));
  const C4 = val(vencido, Math.min(1, dueClient.length / PARAMS.nFacturasRef));
  return {
    vars: {
      C1: top3Share(ctx, "cobrosPorContraparte", cobrosOp12m),
      C2: top3Share(ctx, "pagosPorContraparte", pagosOp12m),
      C3,
      C4,
      C5: val(med && med > 0 ? mad(obsCobros)! / med : null, (ctx.obs12 / 12) * ctx.cobertura12),
      C6: val(divide(s(ctx.w6, "recibosDevueltos"), s(ctx.w6, "cobrosOp")), ctx.cTx),
    },
    extras: { C3dias: C3.raw, C4: C4.raw },
    cobertura: {
      nFacturasCli6m: new Set([...paidClient, ...dueClient].map((i) => i.id)).size,
      C4Estimado: CALENDAR[ctx.t] < PARAMS.mesFin,
    },
  };
}

export function computeVariables(input: VariableInput): { vars: VariableSet; extras: Extras } {
  const { t, history } = input;
  const w6 = window(history, t, 6);
  const w12 = window(history, t, 12);
  const obs6 = w6.filter((f) => f?.observed).length;
  const obs12 = w12.filter((f) => f?.observed).length;
  const cobertura6 = pctClasificado(w6);
  const ctx: Ctx = {
    t,
    history,
    w3: window(history, t, 3),
    w6,
    w12,
    obs6,
    obs12,
    nCal6: Math.min(6, t + 1),
    cVentana6: obs6 / 6,
    cobertura6,
    cobertura12: pctClasificado(w12),
    cTx: (obs6 / 6) * cobertura6,
  };
  const inv = invoiceWindow(t, input.invoices);
  const a = blockA(ctx, input.hasLine, input.scheduleMonthly);
  const b = blockB(ctx, inv, input.scheduleMonthly);
  const c = blockC(ctx, inv, a.extras.cobrosOp12m!, a.extras.pagosOp12m!);
  const vars: VariableSet = {
    ...(Object.fromEntries(VARIABLES.map((v) => [v, na()])) as VariableSet),
    ...a.vars,
    ...b.vars,
    ...c.vars,
  };
  const extras = {
    rachaB2: 0,
    rachaB2Prev: [0, 0, 0],
    rachaDeficit: 0,
    C3dias: null,
    C4: null,
    deficitMes: null,
    margenMes: null,
    ...a.extras,
    ...b.extras,
    ...c.extras,
    cobertura: {
      mesesObs6m: obs6,
      mesesObs12m: obs12,
      pctClasificado6m: cobertura6,
      nFacturasCli6m: 0,
      nFacturasProv6m: 0,
      tieneLineaCredito: input.hasLine,
      tieneCuotas: false,
      C4Estimado: true,
      importesExcluidosEur: s(w6, "excluido"),
      hardcoreRevolving: false,
      ...a.cobertura,
      ...b.cobertura,
      ...c.cobertura,
    },
  } as Extras;
  return { vars, extras };
}
