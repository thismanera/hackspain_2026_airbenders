import assert from "node:assert/strict";
import test from "node:test";
import { emptyFlow } from "@/lib/features/scoring/flows";
import {
  computeVariables,
  medianDelay,
  type VariableInput,
} from "@/lib/features/scoring/variables";
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
  // B1 agrupa las cuatro categorias: 200 k pagados sobre 210 k esperados (§5.2)
  assert.ok(Math.abs(m4.vars.B1.raw! - 200_000 / 210_000) < 1e-9);
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

test("C1/C2 concentration over 12 months of identified counterparties", () => {
  const h = sanaHistory(6, (f) => {
    f.pagosPorContraparte = { p1: 40_000, p2: 5_000, p3: 5_000, p4: 5_000 };
  });
  const { vars } = computeVariables(input(h, 5));
  assert.ok(Math.abs(vars.C1.raw! - 0.3) < 1e-9); // 10 clientes iguales
  assert.ok(Math.abs(vars.C2.raw! - 50 / 55) < 1e-9);
  assert.ok(Math.abs(vars.C1.conf - (6 / 12) * 1) < 1e-9); // identificados 100 %, ventana 6/12
});

test("C3, C4 from client invoices; C6 from returned receipts; C5 needs 6 observations", () => {
  const inv = (id: string, due: string, paid: string, status: string, amount: number): Invoice => ({
    id,
    company: "c",
    issued: "2024-12-01",
    due,
    paid,
    amount,
    status,
    counterparty: "k",
  });
  const invoices = [
    inv("1", "2025-01-05", "2025-01-15", "paid", 100),
    inv("2", "2025-01-05", "2025-01-05", "overdue", 300),
    inv("3", "2025-01-05", "2025-03-01", "paid", 100), // pagada tras fin(t): vencida en t
  ];
  const h = sanaHistory(6, (f) => (f.recibosDevueltos = 2_000));
  const { vars, extras } = computeVariables(input(h, 4, { invoices })); // t=4 → 2025-01
  assert.equal(vars.C3.raw, 10);
  assert.ok(Math.abs(vars.C4.raw! - 400 / 500) < 1e-9);
  assert.equal(extras.C4, vars.C4.raw);
  assert.ok(Math.abs(vars.C6.raw! - 0.02) < 1e-9);
  assert.equal(vars.C5.raw, null); // 5 meses observados < 6
  const { vars: v6 } = computeVariables(input(h, 5));
  assert.equal(v6.C5.raw, 0); // 6 meses iguales → MAD 0
});

test("A5 with a credit line measures drawdowns over receipts", () => {
  const h = sanaHistory(6, (f) => (f.dispCredito = 20_000));
  const { vars } = computeVariables(input(h, 5, { hasLine: true }));
  assert.ok(Math.abs(vars.A5.raw! - 0.2) < 1e-9);
  assert.equal(vars.A5.conf, 1);
});

test("C1 confidence scales with the identified share of receipts", () => {
  const h = sanaHistory(6, (f) => {
    f.cobrosPorContraparte = { cli1: 20_000, cli2: 10_000 };
  });
  const { vars } = computeVariables(input(h, 5));
  assert.equal(vars.C1.raw, 1); // los dos identificados son el top-3
  assert.ok(Math.abs(vars.C1.conf - (6 / 12) * 0.3) < 1e-9);
});

test("the debt schedule overrides the median expected instalment", () => {
  const h = sanaHistory();
  const alto = computeVariables(input(h, 5, { scheduleMonthly: 6_000 }));
  assert.ok(Math.abs(alto.vars.B1.raw! - 315_000 / 324_000) < 1e-9);
  const bajo = computeVariables(input(h, 5, { scheduleMonthly: 1_000 }));
  assert.equal(bajo.vars.B1.raw, 1); // pagado > esperado: B1 capado a 1
});

test("B1/B2 are NA when no obligation is recurrent", () => {
  const h = sanaHistory(6, (f) => {
    f.obligaciones = { tax: 0, social_security: 0, salary: 0, debt_repayment: 0 };
  });
  const { vars, extras } = computeVariables(input(h, 5));
  assert.equal(vars.B1.raw, null);
  assert.equal(vars.B1.conf, 0);
  assert.equal(vars.B2.raw, null);
  assert.equal(extras.rachaB2, 0);
});

test("a month without a flow row breaks the obligation streak", () => {
  const h = sanaHistory(6, (f, i) => {
    if (i >= 4) f.obligaciones.tax = 0;
  });
  assert.equal(computeVariables(input(h, 5)).vars.B2.raw, 2);
  h[4] = undefined; // mes sin datos: no cuenta como impago
  assert.equal(computeVariables(input(h, 5)).vars.B2.raw, 1);
});

test("racha_deficit counts consecutive observed months in the red", () => {
  const h = sanaHistory(6, (f, i) => {
    if (i >= 4) f.cobrosOp = 50_000;
  });
  const { extras } = computeVariables(input(h, 5));
  assert.equal(extras.rachaDeficit, 2);
  assert.equal(extras.deficitMes, true);
  assert.ok(extras.margenMes! < 0);
});

test("medianDelay keeps early payments and drops absurd delays", () => {
  const inv = (id: string, due: string, paid: string): Invoice => ({
    id, company: "c", issued: "2024-12-01", due, paid, amount: 100, status: "paid", counterparty: "k",
  });
  assert.deepEqual(medianDelay([inv("1", "2025-01-10", "2025-01-05")]), { value: -5, n: 1 });
  assert.deepEqual(medianDelay([inv("1", "2025-01-10", "2027-01-05")]), { value: null, n: 0 });
  assert.deepEqual(medianDelay([]), { value: null, n: 0 });
});
