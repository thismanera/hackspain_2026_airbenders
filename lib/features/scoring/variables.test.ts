import assert from "node:assert/strict";
import test from "node:test";
import { emptyFlow } from "@/lib/features/scoring/flows";
import { computeVariables, type VariableInput } from "@/lib/features/scoring/variables";
import { CALENDAR } from "@/lib/features/scoring/windows";
import type { Flow } from "@/lib/features/scoring/types";

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
