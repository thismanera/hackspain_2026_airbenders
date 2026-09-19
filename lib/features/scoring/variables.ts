import { pctClasificado } from "@/lib/features/scoring/flows";
import { PARAMS, VARIABLES, type VariableId } from "@/lib/features/scoring/params";
import type { Extras, Flow, Invoice, VariableSet } from "@/lib/features/scoring/types";
import { divide, sum, window } from "@/lib/features/scoring/windows";

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

  // ---- Bloque B (Tarea 7): insertar aquí

  // ---- Bloque C (Tarea 8): insertar aquí

  return { vars, extras };
}
