import assert from "node:assert/strict";
import test from "node:test";
import { flowsConst, rowsFromSeries } from "@/lib/features/forecast/__fixtures__/series";
import { CALENDAR } from "@/lib/features/scoring/windows";

test("rowsFromSeries builds one coherent ScoreRow per month", () => {
  const { rows, flows } = rowsFromSeries("c", "g", { A1: [0.15, 0.15, 0.15] });
  assert.equal(rows.length, 3);
  assert.equal(rows[2].month, CALENDAR[2]);
  assert.equal(rows[2].variables.length, 15);
  const suma = rows[2].variables.reduce((a, c) => a + c.aportacion, 0);
  assert.ok(Math.abs(suma - rows[2].score) < 1e-9);
  assert.equal(rows[2].variables.find((c) => c.id === "A1")!.raw, 0.15);
  assert.equal(flows.length, 3);
  assert.equal(flows[0]!.cobrosOp, 100_000);
});

test("group options feed D2 and the aval", () => {
  const { rows } = rowsFromSeries("f", "g", { A1: [0.15, 0.15] }, {
    grupo: () => ({ D1: 0.2, D2: 95, D3: 3, D5: 0.15, confD: 1 }),
  });
  assert.ok(rows[1].avalGrupo > 0);
  assert.equal(rows[1].variables.find((c) => c.id === "grupo")!.raw, 95);
  assert.ok(Math.abs(rows[1].score - rows[1].scoreSolo - rows[1].avalGrupo) < 1e-9);
});

test("flowsConst repeats a flow n months", () => {
  assert.equal(flowsConst(4, 100, 85).length, 4);
  assert.deepEqual(flowsConst(1, 100, 85)[0], { observed: true, cobrosOp: 100, pagosOp: 85 });
});
