import type { MirrorKind } from "@/lib/features/scoring/mirrors";
import { PARAMS } from "@/lib/features/scoring/params";
import type { Flow, GroupFlow, Product, Tx } from "@/lib/features/scoring/types";

const COBROS = new Set(["collection", "bulk_collection", "pos_settlement", "cash_settlement", "cash_settlements"]);
const PAGOS = new Set(["payment", "bulk_payment", "utility", "salary", "social_security", "tax", "fee"]);
const OBLIG = new Set(["tax", "social_security", "salary"]);
const OPERATIVAS = new Set(["checking", "saving", "wallet"]);

export function emptyFlow(company: string, month: string): Flow {
  return {
    company, month, observed: false,
    cobrosOp: 0, pagosOp: 0, servicioDeuda: 0, dispCredito: 0, amortCredito: 0, recibosDevueltos: 0,
    obligaciones: { tax: 0, social_security: 0, salary: 0, debt_repayment: 0 },
    intragrupoIn: 0, intragrupoOut: 0,
    clasificado: 0, neutral: 0, sinClasificar: 0, nMov: 0, nExcluidos: 0,
    cobrosPorContraparte: {}, pagosPorContraparte: {},
  };
}

function add(map: Record<string, number>, key: string, amount: number): void {
  if (key) map[key] = (map[key] ?? 0) + amount;
}

/** txs: movimientos booked de UNA empresa, en ventana, con importe en €. mirrors: resultado de pairMirrors sobre el grupo. */
export function monthlyFlows(
  company: string,
  txs: Tx[],
  products: Map<string, Product>,
  mirrors: Map<string, MirrorKind>,
): Map<string, Flow> {
  const flows = new Map<string, Flow>();
  for (const t of txs) {
    if (t.month < PARAMS.mesInicio || t.month > PARAMS.mesFin) continue;
    const f = flows.get(t.month) ?? emptyFlow(company, t.month);
    flows.set(t.month, f);
    f.nMov++;
    const p = products.get(t.product);
    if (t.amount === null || !p) {
      f.nExcluidos++;
      continue;
    }
    const a = Math.abs(t.amount);
    const mirror = mirrors.get(t.id);
    if (mirror === "interno") {
      f.neutral += a;
      continue;
    }
    if (mirror === "intragrupo") {
      if (t.amount > 0) f.intragrupoIn += a;
      else f.intragrupoOut += a;
      continue;
    }
    if (p.type === "lineofcredit") {
      if (t.amount > 0) f.dispCredito += a;
      else f.amortCredito += a;
      f.clasificado += a;
      continue;
    }
    if (!OPERATIVAS.has(p.type)) {
      f.nExcluidos++;
      continue;
    }
    f.observed = true;
    const c = t.category;
    if (c === "unknown" || c === "-" || c === "") f.sinClasificar += a;
    else if (c === "debt_drawdown" && t.amount > 0) {
      f.dispCredito += a;
      f.clasificado += a;
    } else if (COBROS.has(c) && t.amount > 0) {
      f.cobrosOp += a;
      f.clasificado += a;
      add(f.cobrosPorContraparte, t.counterparty, a);
    } else if (PAGOS.has(c) && t.amount < 0) {
      f.pagosOp += a;
      f.clasificado += a;
      if (OBLIG.has(c)) f.obligaciones[c as "tax" | "social_security" | "salary"] += a;
      add(f.pagosPorContraparte, t.counterparty, a);
    } else if ((c === "debt_repayment" || c === "interest_charge") && t.amount < 0) {
      f.servicioDeuda += a;
      f.clasificado += a;
      if (c === "debt_repayment") f.obligaciones.debt_repayment += a;
    } else if (c === "collection_refund" && t.amount < 0) {
      f.recibosDevueltos += a;
      f.clasificado += a;
    } else f.neutral += a;
  }
  return flows;
}

export function groupFlows(members: Map<string, Flow>[]): Map<string, GroupFlow> {
  const out = new Map<string, GroupFlow>();
  for (const flows of members)
    for (const f of flows.values()) {
      const g = out.get(f.month) ?? { month: f.month, cobrosOp: 0, pagosOp: 0, servicioDeuda: 0, nEmpresas: 0 };
      g.cobrosOp += f.cobrosOp;
      g.pagosOp += f.pagosOp;
      g.servicioDeuda += f.servicioDeuda;
      g.nEmpresas++;
      out.set(f.month, g);
    }
  return out;
}

export function pctClasificado(flows: (Flow | undefined)[]): number {
  let clasificado = 0, resto = 0, nMov = 0, nExcl = 0;
  for (const f of flows) {
    if (!f) continue;
    clasificado += f.clasificado;
    resto += f.neutral + f.sinClasificar;
    nMov += f.nMov;
    nExcl += f.nExcluidos;
  }
  const porImporte = clasificado + resto > 0 ? clasificado / (clasificado + resto) : 0;
  const porFilas = nMov > 0 ? (nMov - nExcl) / nMov : 1;
  return porImporte * porFilas;
}
