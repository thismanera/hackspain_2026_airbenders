export const START = "2024-09";
export const END = "2026-08";
export const WEIGHTS = [16, 12, 12, 5, 8, 8, 4, 10, 10, 5, 5, 5] as const;
export const MODEL_SPEC = {
  name: "scoring-engine-v0.2-legacy-2",
  weights: WEIGHTS,
  directionThreshold: 6,
  coverageRatio: 1.3,
  stressReceipts: 0.8,
  stressPayments: 1.1,
  advanceRate: 0.8,
  bandThresholds: [75, 60, 45],
  bandFactors: [1, 0.7, 0.4, 0],
  confidenceTarget: 0.6,
  lowConfidence: 0.3,
  openingConfidence: 0.5,
  monthlyChangeCap: 0.25,
  currency: "EUR",
} as const;
export const INDICATORS = [
  "margin",
  "deficit",
  "debtCover",
  "interest",
  "receivableDelay",
  "overdue",
  "payableDelay",
  "revenueTrend",
  "marginTrend",
  "concentration",
  "volatility",
  "creditUse",
] as const;
export type Indicator = (typeof INDICATORS)[number];
export type Tx = {
  id: string;
  company: string;
  product: string;
  date: string;
  month: string;
  amount: number;
  category: string;
  counterparty: string;
};
export type Invoice = {
  id: string;
  company: string;
  issued: string;
  due: string;
  paid: string;
  amount: number;
  status: string;
  counterparty: string;
};
export type Product = { company: string; type: string; currency: string };
export type Flow = {
  company: string;
  month: string;
  observed: boolean;
  received: number;
  spent: number;
  interest: number;
  debt: number;
  creditDraw: number;
  creditRepay: number;
  unknown: number;
  classified: number;
  totalCount: number;
  unusableCount: number;
  collectedRefund: number;
  counterpartiesIn: Record<string, number>;
  counterpartiesOut: Record<string, number>;
};
export type Raw = {
  values: (number | null)[];
  neutral: boolean[];
  confidence: number[];
  flow: Flow;
  overdue: number | null;
};
export type Scale = { lo: number; hi: number };
export type Parameters = {
  version: string;
  modelHash: string;
  scales: Scale[];
  creditP90: number;
  invoiceEnabled: boolean;
  trainGroups: string[];
  validationGroups: string[];
  inputFingerprint: string;
};
export type Contribution = {
  indicator: Indicator;
  raw: number | null;
  subscore: number;
  weight: number;
  confidence: number;
  contribution: number;
};
export type Alert = { type: string; indicator: string; onsetMonth: string; confirmedMonth: string };
export type Result = {
  company: string;
  month: string;
  score: number;
  confidence: number;
  monthlyDeficit: boolean | null;
  monthlyMargin: number | null;
  trend3m: number | null;
  direction: "mejora" | "estable" | "deterioro";
  nature: "temporal" | "estructural" | "sin_cambio";
  contributions: Contribution[];
  deltas: { indicator: Indicator; delta: number }[];
  baseCapacity: number;
  adverseCapacity: number;
  capacityLimit: number;
  operatingLimit: number;
  recommendedLimit: number;
  appliedLimit: number;
  band: "A" | "B" | "C" | "D";
  price: number | null;
  action: "abrir" | "ampliar" | "mantener" | "reducir" | "cerrar";
  reason: string;
  alerts: Alert[];
  coverage: {
    observedMonths: number;
    classifiedShare: number;
    hasInvoices: boolean;
    hasDebt: boolean;
    invoiceHistoryEstimated: true;
  };
  parameterVersion: string;
};

export function months(): string[] {
  const out: string[] = [];
  for (let y = 2024, m = 9; y < 2026 || (y === 2026 && m <= 8); m++) {
    if (m === 13) {
      y++;
      m = 1;
    }
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  return (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2;
}
export function percentile(xs: number[], p: number): number {
  const a = [...xs].sort((x, y) => x - y);
  if (!a.length) return 0;
  const i = (a.length - 1) * p;
  const k = Math.floor(i);
  return a[k] + (a[Math.min(k + 1, a.length - 1)] - a[k]) * (i - k);
}
export function clamp(n: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, n));
}
export function divide(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}
export function emptyFlow(company: string, month: string): Flow {
  return {
    company,
    month,
    observed: false,
    received: 0,
    spent: 0,
    interest: 0,
    debt: 0,
    creditDraw: 0,
    creditRepay: 0,
    unknown: 0,
    classified: 0,
    totalCount: 0,
    unusableCount: 0,
    collectedRefund: 0,
    counterpartiesIn: {},
    counterpartiesOut: {},
  };
}

const RECEIPTS = new Set([
  "collection",
  "bulk_collection",
  "pos_settlement",
  "cash_settlement",
  "cash_settlements",
  "payment_refund",
]);
const PAYMENTS = new Set([
  "payment",
  "bulk_payment",
  "utility",
  "salary",
  "social_security",
  "tax",
  "fee",
  "collection_refund",
]);
export function monthlyFlows(
  company: string,
  txs: Tx[],
  products: Map<string, Product>,
): Map<string, Flow> {
  const flows = new Map<string, Flow>();
  const transfers = txs
    .filter((t) => t.category === "transfer")
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const paired = new Set<string>();
  const byAmount = new Map<number, Tx[]>();
  for (const t of transfers) {
    const key = Math.round(Math.abs(t.amount) * 100);
    const list = byAmount.get(key) ?? [];
    list.push(t);
    byAmount.set(key, list);
  }
  for (const list of byAmount.values())
    for (const a of list) {
      if (paired.has(a.id)) continue;
      const b = list.find(
        (x) =>
          x.id !== a.id &&
          !paired.has(x.id) &&
          x.product !== a.product &&
          x.amount * a.amount < 0 &&
          Math.abs(Date.parse(x.date) - Date.parse(a.date)) <= 172800000,
      );
      if (b) {
        paired.add(a.id);
        paired.add(b.id);
      }
    }
  for (const t of txs) {
    if (t.month < START || t.month > END) continue;
    const p = products.get(t.product);
    const f = flows.get(t.month) ?? emptyFlow(company, t.month);
    flows.set(t.month, f);
    f.totalCount++;
    if (!p || p.currency !== "EUR") {
      f.unusableCount++;
      continue;
    }
    f.observed = true;
    const a = Math.abs(t.amount);
    if (p.type === "lineofcredit") {
      if (t.amount > 0) f.creditDraw += a;
      else f.creditRepay += a;
      continue;
    }
    if (!["checking", "saving", "wallet"].includes(p.type)) continue;
    if (!t.category || t.category === "-") {
      f.unknown += a;
      continue;
    }
    if (t.category === "transfer" || paired.has(t.id)) continue;
    if (RECEIPTS.has(t.category) && t.amount > 0) {
      f.received += a;
      f.classified += a;
      if (t.counterparty)
        f.counterpartiesIn[t.counterparty] = (f.counterpartiesIn[t.counterparty] ?? 0) + a;
    } else if (PAYMENTS.has(t.category) && t.amount < 0) {
      f.spent += a;
      f.classified += a;
      if (t.category === "collection_refund") f.collectedRefund += a;
      if (t.counterparty)
        f.counterpartiesOut[t.counterparty] = (f.counterpartiesOut[t.counterparty] ?? 0) + a;
    } else if (t.category === "debt_repayment" && t.amount < 0) f.debt += a;
    else if (t.category === "interest_charge" && t.amount < 0) f.interest += a;
  }
  return flows;
}
