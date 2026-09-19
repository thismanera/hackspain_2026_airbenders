import assert from "node:assert/strict";
import test from "node:test";
import { emptyFlow } from "@/lib/features/scoring/flows";
import { computeVariables, type VariableInput } from "@/lib/features/scoring/variables";
import { CALENDAR } from "@/lib/features/scoring/windows";
import type { Flow, Invoice } from "@/lib/features/scoring/types";

export function sanaHistory(
  months = 6,
  patch: (f: Flow, i: number) => void = () => {},
): (Flow | undefined)[] {
  const history: (Flow | undefined)[] = Array(CALENDAR.length).fill(undefined);
  for (let i = 0; i < months; i++) {
    const f = emptyFlow("c", CALENDAR[i]);
    f.observed = true;
    f.cobrosOp = 100_000;
    f.pagosOp = 85_000;
    f.servicioDeuda = 5_000;
    f.obligaciones = { tax: 10_000, social_security: 8_000, salary: 30_000, debt_repayment: 4_500 };
    f.clasificado = 190_000;
    for (let k = 1; k <= 10; k++) f.cobrosPorContraparte[`cli${k}`] = 10_000;
    patch(f, i);
    history[i] = f;
  }
  return history;
}

export function input(
  history: (Flow | undefined)[],
  t: number,
  extra: Partial<VariableInput> = {},
): VariableInput {
  return { company: "c", t, history, invoices: [], scheduleMonthly: 0, hasLine: false, ...extra };
}

test("block A on the sana fixture", () => {
  const { vars, extras } = computeVariables(input(sanaHistory(), 5));
  assert.ok(Math.abs(vars.A1.raw! - 0.15) < 1e-9);
  assert.equal(vars.A2.raw, 0);
  assert.ok(Math.abs(vars.A3.raw! - 3) < 1e-9);
  assert.ok(Math.abs(vars.A4.raw! - 0.05) < 1e-9);
  assert.equal(vars.A5.raw, null);
  assert.equal(vars.A5.conf, 0.3);
  assert.equal(vars.A1.conf, 1);
  assert.equal(extras.cobrosOpMedia6m, 100_000);
  assert.equal(extras.rachaDeficit, 0);
  assert.equal(extras.deficitMes, false);
  // saturada en 0: con este fixture la caja estresada es negativa (scoring-engine §6)
  const capAdv = Math.max(0, (0.8 * 100_000 - 1.1 * 85_000) / 1.3 - 5_000);
  assert.ok(Math.abs(extras.capacidadCuotaAdv - capAdv) < 1e-6);
});

test("A3 is NA without debt service, confidence scales with observed months", () => {
  const h = sanaHistory(2, (f) => (f.servicioDeuda = 0));
  const { vars } = computeVariables(input(h, 5));
  assert.equal(vars.A3.raw, null);
  assert.equal(vars.A3.conf, 0);
  assert.ok(Math.abs(vars.A1.conf - 2 / 6) < 1e-9);
});

test("B1/B2 on sana: everything paid, no streak", () => {
  const { vars, extras } = computeVariables(input(sanaHistory(), 5));
  assert.equal(vars.B1.raw, 1);
  assert.equal(vars.B2.raw, 0);
  assert.equal(extras.rachaB2, 0);
  assert.equal(vars.B3.raw, null);
});

test("salto_un_mes: skipped tax in month 4, double in month 5", () => {
  const h = sanaHistory(6, (f, i) => {
    if (i === 3) f.obligaciones.tax = 0;
    if (i === 4) f.obligaciones.tax = 20_000;
  });
  const m4 = computeVariables(input(h, 3));
  assert.equal(m4.vars.B2.raw, 1);
  assert.ok(m4.vars.B1.raw! < 1);
  const m5 = computeVariables(input(h, 4));
  assert.equal(m5.vars.B2.raw, 0);
  assert.equal(m5.vars.B1.raw, 1);
  assert.deepEqual(m5.extras.rachaB2Prev, [1, 0, 0]);
});

test("impago: two months without social security", () => {
  const h = sanaHistory(6, (f, i) => {
    if (i >= 4) f.obligaciones.social_security = 0;
  });
  const { vars } = computeVariables(input(h, 5));
  assert.equal(vars.B2.raw, 2);
});

test("B3 median supplier delay from paid invoices in the last 6 months", () => {
  const inv = (id: string, due: string, paid: string, amount: number): Invoice => ({
    id,
    company: "c",
    issued: "2024-12-01",
    due,
    paid,
    amount,
    status: "paid",
    counterparty: "s",
  });
  const invoices = [
    inv("1", "2025-01-10", "2025-01-20", -100),
    inv("2", "2025-01-10", "2025-01-12", -100),
    inv("3", "2025-01-10", "2025-02-15", -100),
  ];
  const { vars } = computeVariables(input(sanaHistory(), 4, { invoices })); // t=4 → 2025-01
  assert.equal(vars.B3.raw, 6); // mediana de 10 y 2; la de febrero queda fuera (pagada tras fin(t))
  assert.ok(Math.abs(vars.B3.conf - 2 / 5) < 1e-9);
});
