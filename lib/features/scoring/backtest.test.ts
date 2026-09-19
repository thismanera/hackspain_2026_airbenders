import assert from "node:assert/strict";
import test from "node:test";
import { backtest } from "@/lib/features/scoring/backtest";
import type { ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

function series(deficit: boolean[], alertAt: Record<number, string>): ScoreRow[] {
  return deficit.map((d, i) => ({
    company: "c",
    month: CALENDAR[i],
    score: 60,
    deficitMes: d,
    margenMes: d ? -0.1 : 0.1,
    alertas: alertAt[i] ? [{ tipo: "deterioro", desdeMes: alertAt[i] }] : [],
  })) as unknown as ScoreRow[];
}

test("deterioration event detected and lead time measured from desdeMes", () => {
  const deficit = [
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    true,
    true,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ];
  const rows = series(deficit, { 6: CALENDAR[5], 7: CALENDAR[5] });
  const r = backtest(rows);
  assert.equal(r.deterioro.events, 1);
  assert.equal(r.deterioro.matched, 1);
  assert.equal(r.deterioro.leadMedian, 3); // evento en índice 8, desdeMes índice 5
  assert.equal(r.deterioro.falseAlarmRate, 0);
});
