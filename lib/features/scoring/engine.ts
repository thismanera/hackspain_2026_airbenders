import { createHash } from "node:crypto";
import {
  clamp,
  divide,
  emptyFlow,
  INDICATORS,
  median,
  MODEL_SPEC,
  months,
  percentile,
  WEIGHTS,
  type Alert,
  type Flow,
  type Invoice,
  type Parameters,
  type Raw,
  type Result,
  type Scale,
} from "@/lib/features/scoring/model";

const CALENDAR = months();
function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
function classifiedShare(flows: Flow[]): number {
  const classified = sum(flows.map((f) => f.classified));
  const unknown = sum(flows.map((f) => f.unknown));
  const total = sum(flows.map((f) => f.totalCount));
  const unusable = sum(flows.map((f) => f.unusableCount));
  return (divide(classified, classified + unknown) ?? 0) * (total ? (total - unusable) / total : 0);
}
function tail<T>(xs: T[], n: number): T[] {
  return xs.slice(Math.max(0, xs.length - n));
}
function paidAt(i: Invoice, end: string): boolean {
  return i.status === "paid" && !!i.paid && i.paid <= end;
}
function days(a: string, b: string): number {
  return (Date.parse(a) - Date.parse(b)) / 86400000;
}
function medianDelay(items: Invoice[]): number | null {
  return median(items.filter((i) => i.paid && i.paid !== i.due).map((i) => days(i.paid, i.due)));
}
function top3Invoices(invoices: Invoice[]): number | null {
  const by = new Map<string, number>();
  for (const invoice of invoices)
    if (invoice.counterparty)
      by.set(invoice.counterparty, (by.get(invoice.counterparty) ?? 0) + invoice.amount);
  const vals = [...by.values()].sort((a, b) => b - a);
  return divide(sum(vals.slice(0, 3)), sum(vals));
}
function seasonalTrend(
  series: number[],
  current: number,
  prior: number,
  monthIndex: number,
): number {
  const baseline = prior > 0 ? (current - prior) / prior : 0;
  if (monthIndex < 14) return baseline;
  const old = sum(series.slice(monthIndex - 14, monthIndex - 11));
  const seasonal = old > 0 ? (current - old) / old : 0;
  return Math.min(baseline, seasonal);
}
export function rawAt(
  company: string,
  monthIndex: number,
  flows: Map<string, Flow>,
  invoices: Invoice[],
): Raw {
  const history = CALENDAR.slice(0, monthIndex + 1).map(
    (m) => flows.get(m) ?? emptyFlow(company, m),
  );
  const recent = tail(history, 6),
    year = tail(history, 12),
    last3 = tail(history, 3),
    prior3 = history.slice(-6, -3);
  const received = sum(recent.map((f) => f.received)),
    spent = sum(recent.map((f) => f.spent));
  const observed = recent.filter((f) => f.observed).length;
  const coverage = classifiedShare(recent);
  const end = `${CALENDAR[monthIndex]}-31`;
  const start6 = `${CALENDAR[Math.max(0, monthIndex - 5)]}-01`;
  const start12 = `${CALENDAR[Math.max(0, monthIndex - 11)]}-01`;
  const eligible = invoices.filter((i) => i.issued <= end);
  const client = eligible.filter((i) => i.amount > 0),
    supplier = eligible.filter((i) => i.amount < 0);
  const identifiedClient = client.filter((i) => i.issued >= start12 && i.counterparty);
  const paidClient = client.filter((i) => paidAt(i, end) && i.paid >= start6);
  const paidSupplier = supplier.filter((i) => paidAt(i, end) && i.paid >= start6);
  const dueClient = client.filter((i) => i.due >= start6 && i.due <= end);
  const overdue = divide(
    sum(dueClient.filter((i) => !paidAt(i, end)).map((i) => i.amount)),
    sum(dueClient.map((i) => i.amount)),
  );
  const receiptSeries = history.map((f) => f.received);
  const current3 = sum(last3.map((f) => f.received)),
    previous3 = sum(prior3.map((f) => f.received));
  const currentMargin = divide(current3 - sum(last3.map((f) => f.spent)), current3);
  const previousMargin = divide(previous3 - sum(prior3.map((f) => f.spent)), previous3);
  const marginTrend =
    currentMargin !== null && previousMargin !== null ? currentMargin - previousMargin : null;
  const old3 = monthIndex >= 14 ? history.slice(monthIndex - 14, monthIndex - 11) : [];
  const oldReceived = sum(old3.map((f) => f.received));
  const oldMargin = divide(oldReceived - sum(old3.map((f) => f.spent)), oldReceived);
  const margins =
    marginTrend === null
      ? null
      : monthIndex >= 14 && oldMargin !== null
        ? Math.min(marginTrend, (currentMargin ?? 0) - oldMargin)
        : marginTrend;
  const cash = received - spent,
    debt = sum(recent.map((f) => f.debt + f.interest));
  const noCredit = sum(recent.map((f) => f.creditDraw + f.creditRepay)) === 0;
  const observedYear = year.filter((f) => f.observed);
  const med = observedYear.length >= 6 ? median(observedYear.map((f) => f.received)) : null;
  const vol =
    med && med > 0
      ? (median(observedYear.map((f) => Math.abs(f.received - med))) ?? 0) / med
      : null;
  const values: (number | null)[] = [
    divide(cash, received),
    observed ? recent.filter((f) => f.observed && f.received < f.spent).length / observed : null,
    divide(cash, debt),
    divide(sum(recent.map((f) => f.interest)), received),
    medianDelay(paidClient),
    overdue,
    medianDelay(paidSupplier),
    previous3 > 0 ? seasonalTrend(receiptSeries, current3, previous3, monthIndex) : null,
    margins,
    top3Invoices(identifiedClient),
    vol,
    divide(sum(recent.map((f) => f.creditDraw)), received),
  ];
  const neutral = values.map((_, n) => (n === 3 && debt === 0) || (n === 11 && noCredit));
  const c6 = observed / 6,
    c12 = year.filter((f) => f.observed).length / 12;
  const confidence = values.map((v, n) => {
    if (v === null || !Number.isFinite(v)) return 0;
    if ([4, 5, 6].includes(n))
      return (
        c6 *
        Math.min(
          1,
          (n === 4 ? paidClient.length : n === 5 ? dueClient.length : paidSupplier.length) / 5,
        )
      );
    if (n === 9) return c12 * Math.min(1, identifiedClient.length / 5);
    if ([7, 8].includes(n))
      return Math.min(1, history.filter((f) => f.observed).length / 6) * coverage;
    if ([10].includes(n)) return c12 * coverage;
    if (n === 3 && debt === 0) return c6 * 0.3 * coverage;
    if (n === 11 && noCredit) return c6 * 0.3 * coverage;
    return c6 * coverage;
  });
  return { values, neutral, confidence, flow: history[monthIndex], overdue };
}

const INVERT = new Set([1, 3, 4, 5, 6, 9, 10, 11]);
const BOUNDED = new Set([1, 5, 9]);
const TREND = new Set([7, 8]);
export function subscore(value: number | null, index: number, scale: Scale): number {
  if (value === null || !Number.isFinite(value)) return 50;
  let s: number;
  if (TREND.has(index)) s = scale.hi > 0 ? 50 + 50 * clamp(value / scale.hi, -1, 1) : 50;
  else if (BOUNDED.has(index)) s = 100 * clamp(value);
  else s = scale.hi > scale.lo ? 100 * clamp((value - scale.lo) / (scale.hi - scale.lo)) : 50;
  return INVERT.has(index) ? 100 - s : s;
}
export function groupSplit(groups: string[]) {
  const unique = [...new Set(groups)].sort((a, b) =>
    createHash("sha256")
      .update(`42:${a}`)
      .digest("hex")
      .localeCompare(createHash("sha256").update(`42:${b}`).digest("hex")),
  );
  const cut = Math.ceil(unique.length * 0.7);
  return { train: unique.slice(0, cut), validation: unique.slice(cut) };
}
export function fit(
  raws: Raw[],
  groups: string[],
  inputFingerprint: string,
  invoiceEnabled = true,
): Parameters {
  const split = groupSplit(groups);
  const scales = INDICATORS.map((_, n) => {
    const vals = raws
      .map((r) => r.values[n])
      .filter((v): v is number => v !== null && Number.isFinite(v));
    return TREND.has(n)
      ? { lo: 0, hi: percentile(vals.map(Math.abs), 0.95) }
      : { lo: percentile(vals, 0.05), hi: percentile(vals, 0.95) };
  });
  const creditP90 = percentile(
    raws.map((r) => r.values[11]).filter((v): v is number => v !== null),
    0.9,
  );
  const core = {
    modelHash: createHash("sha256").update(JSON.stringify(MODEL_SPEC)).digest("hex"),
    scales,
    creditP90,
    invoiceEnabled,
    trainGroups: split.train,
    validationGroups: split.validation,
    inputFingerprint,
  };
  return { ...core, version: createHash("sha256").update(JSON.stringify(core)).digest("hex") };
}
function band(score: number): Result["band"] {
  return score >= MODEL_SPEC.bandThresholds[0]
    ? "A"
    : score >= MODEL_SPEC.bandThresholds[1]
      ? "B"
      : score >= MODEL_SPEC.bandThresholds[2]
        ? "C"
        : "D";
}
function lower(b: Result["band"]): Result["band"] {
  return b === "A" ? "B" : b === "B" ? "C" : "D";
}
export function scoreCompany(
  company: string,
  flows: Map<string, Flow>,
  invoices: Invoice[],
  parameters: Parameters,
): Result[] {
  if (
    parameters.modelHash !== createHash("sha256").update(JSON.stringify(MODEL_SPEC)).digest("hex")
  )
    throw new Error("frozen parameters do not match this scoring model");
  const results: Result[] = [],
    raws = CALENDAR.map((_, i) => rawAt(company, i, flows, invoices));
  const weights = WEIGHTS.map((w, i) =>
    !parameters.invoiceEnabled && [4, 5, 6, 9].includes(i) ? 0 : w,
  );
  const totalWeight = sum(weights);
  for (let t = 0; t < CALENDAR.length; t++) {
    const raw = raws[t],
      month = CALENDAR[t],
      prior = results.at(-1),
      three = results[t - 3];
    const contributions = INDICATORS.map((indicator, i) => {
      const confidence = parameters.invoiceEnabled
        ? raw.confidence[i]
        : weights[i]
          ? raw.confidence[i]
          : 0;
      const s = raw.neutral[i] ? 50 : subscore(raw.values[i], i, parameters.scales[i]);
      const weight = weights[i] / totalWeight;
      return {
        indicator,
        raw: raw.values[i],
        subscore: s,
        weight,
        confidence,
        contribution: weight * (50 + confidence * (s - 50)),
      };
    });
    const score = sum(contributions.map((c) => c.contribution));
    const confidence = sum(contributions.map((c) => c.weight * c.confidence));
    const trend3m = three ? score - three.score : null;
    const direction: Result["direction"] =
      trend3m !== null &&
      trend3m >= MODEL_SPEC.directionThreshold &&
      (!prior || score >= prior.score)
        ? "mejora"
        : trend3m !== null &&
            trend3m <= -MODEL_SPEC.directionThreshold &&
            (!prior || score <= prior.score)
          ? "deterioro"
          : "estable";
    const sign = direction === "mejora" ? 1 : -1;
    const moved = three
      ? contributions.filter(
          (c, i) => sign * (c.contribution - three.contributions[i].contribution) >= 1,
        )
      : [];
    const nature: Result["nature"] =
      direction === "estable"
        ? "sin_cambio"
        : prior?.direction === direction &&
            moved.length >= 2 &&
            moved.some((c) => ["margin", "deficit", "debtCover"].includes(c.indicator))
          ? "estructural"
          : "temporal";
    let b = band(score);
    if (direction === "deterioro" && nature === "estructural") b = lower(b);
    const recent = raws.slice(Math.max(0, t - 5), t + 1).map((r) => r.flow);
    const avg = (key: keyof Flow) => sum(recent.map((f) => Number(f[key]))) / 6;
    const current3 = raws.slice(Math.max(0, t - 2), t + 1).map((r) => r.flow);
    const dues =
      avg("debt") +
      avg("interest") +
      sum(recent.map((f) => Math.max(0, f.creditRepay - f.creditDraw))) / 6;
    const baseCapacity = Math.max(
      0,
      (avg("received") - avg("spent")) / MODEL_SPEC.coverageRatio - dues,
    );
    const adverseCapacity = Math.max(
      0,
      (MODEL_SPEC.stressReceipts * avg("received") - MODEL_SPEC.stressPayments * avg("spent")) /
        MODEL_SPEC.coverageRatio -
        dues,
    );
    const capacityLimit = adverseCapacity * 12,
      operatingLimit = MODEL_SPEC.advanceRate * sum(current3.map((f) => f.received));
    const factor = {
      A: MODEL_SPEC.bandFactors[0],
      B: MODEL_SPEC.bandFactors[1],
      C: MODEL_SPEC.bandFactors[2],
      D: MODEL_SPEC.bandFactors[3],
    }[b];
    const recommendedLimit =
      Math.round(
        (Math.min(capacityLimit, operatingLimit) *
          factor *
          Math.min(1, confidence / MODEL_SPEC.confidenceTarget)) /
          1000,
      ) * 1000;
    const previousLimit = prior?.appliedLimit ?? 0;
    const deficit3 =
      t >= 2 &&
      raws.slice(t - 2, t + 1).every((r) => r.flow.observed && r.flow.received < r.flow.spent);
    const hardClose = b === "D" || deficit3 || (raw.overdue !== null && raw.overdue > 0.4);
    const priorRecommended = prior?.recommendedLimit ?? 0;
    const declining2 =
      prior !== undefined &&
      recommendedLimit < 0.85 * previousLimit &&
      priorRecommended < 0.85 * (results[t - 2]?.appliedLimit ?? 0);
    const action: Result["action"] = hardClose
      ? "cerrar"
      : confidence < MODEL_SPEC.lowConfidence
        ? "mantener"
        : previousLimit === 0 && recommendedLimit > 0 && confidence >= MODEL_SPEC.openingConfidence
          ? "abrir"
          : previousLimit > 0 &&
              (declining2 || (direction === "deterioro" && nature === "estructural"))
            ? "reducir"
            : previousLimit > 0 &&
                recommendedLimit > 1.15 * previousLimit &&
                direction !== "deterioro"
              ? "ampliar"
              : "mantener";
    const appliedLimit =
      action === "cerrar"
        ? 0
        : action === "abrir"
          ? recommendedLimit
          : action === "ampliar"
            ? Math.min(recommendedLimit, previousLimit * (1 + MODEL_SPEC.monthlyChangeCap))
            : action === "reducir"
              ? Math.max(recommendedLimit, previousLimit * (1 - MODEL_SPEC.monthlyChangeCap))
              : previousLimit;
    const deltas = contributions.map((c, i) => ({
      indicator: c.indicator,
      delta: c.contribution - (prior?.contributions[i].contribution ?? c.contribution),
    }));
    const top = [...deltas].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 2);
    const alerts: Alert[] = [];
    const checks = [
      { type: "deterioro", on: direction === "deterioro", count: 2, indicator: "score" },
      {
        type: "deterioro_estructural",
        on: direction === "deterioro" && nature === "estructural",
        count: 1,
        indicator: "score",
      },
      { type: "recuperacion", on: direction === "mejora", count: 2, indicator: "score" },
      { type: "deficit_persistente", on: deficit3, count: 1, indicator: "margin" },
      {
        type: "vencido_alto",
        on: raw.overdue !== null && raw.overdue > 0.4,
        count: 1,
        indicator: "overdue",
      },
      {
        type: "dependencia_credito",
        on: raw.values[11] !== null && raw.values[11] > parameters.creditP90,
        count: 2,
        indicator: "creditUse",
      },
      {
        type: "datos_insuficientes",
        on: confidence < MODEL_SPEC.lowConfidence,
        count: 1,
        indicator: "confidence",
      },
    ];
    for (const c of checks)
      if (c.on) {
        const previous = prior?.alerts.find((a) => a.type === c.type);
        if (c.count === 1 || previous)
          alerts.push({
            type: c.type,
            indicator: c.indicator,
            onsetMonth: previous?.onsetMonth ?? month,
            confirmedMonth: previous?.confirmedMonth ?? month,
          });
        else if (c.count === 2 && t > 0) {
          const previousOn =
            c.type === "deterioro"
              ? prior?.direction === "deterioro"
              : c.type === "recuperacion"
                ? prior?.direction === "mejora"
                : raws[t - 1].values[11] !== null && raws[t - 1].values[11]! > parameters.creditP90;
          if (previousOn)
            alerts.push({
              type: c.type,
              indicator: c.indicator,
              onsetMonth: CALENDAR[t - 1],
              confirmedMonth: month,
            });
        }
      }
    const observedMonths = recent.filter((f) => f.observed).length;
    results.push({
      company,
      month,
      score,
      confidence,
      monthlyDeficit: raw.flow.observed ? raw.flow.received < raw.flow.spent : null,
      monthlyMargin: raw.flow.observed
        ? divide(raw.flow.received - raw.flow.spent, raw.flow.received)
        : null,
      trend3m,
      direction,
      nature,
      contributions,
      deltas,
      baseCapacity,
      adverseCapacity,
      capacityLimit,
      operatingLimit,
      recommendedLimit,
      appliedLimit,
      band: b,
      price: ({ A: 0.05, B: 0.07, C: 0.1, D: null } as const)[b],
      action,
      reason: `${action}: ${top.map((x) => `${x.indicator} ${x.delta >= 0 ? "+" : ""}${x.delta.toFixed(1)}`).join(", ")}`,
      alerts,
      coverage: {
        observedMonths,
        classifiedShare: classifiedShare(recent),
        hasInvoices: invoices.length > 0,
        hasDebt: recent.some((f) => f.debt + f.interest > 0),
        invoiceHistoryEstimated: true,
      },
      parameterVersion: parameters.version,
    });
  }
  return results;
}
