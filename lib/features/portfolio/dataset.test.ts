import assert from "node:assert/strict";
import test from "node:test";

import { decideGroup, parametrosDecision } from "@/lib/features/decision/engine";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";
import { CALENDAR } from "@/lib/features/scoring/windows";

import { monthScore, toPoints } from "./dataset";
import { BANDA } from "./vocabulary";

const rows = CALENDAR.map((month) =>
  scoreRowFixture({
    company: "a",
    month,
    groupId: "g",
    scoreSolo: 82,
    cobrosOpMedia3m: 100_000,
    confianza: 0.9,
    D1: 0.5,
  }),
);
const decisions = decideGroup(rows, parametrosDecision("score-v"));

test("toPoints: fracción del motor → puntos porcentuales del panel", () => {
  assert.equal(toPoints(0.045), 4.5);
  assert.equal(toPoints(0.07), 7);
  assert.equal(toPoints(0), 0);
  assert.equal(toPoints(-0.005), -0.5);
});

test("la TAE del panel está en puntos y el desglose suma la TAE", () => {
  const first = decisions[0];
  assert.ok(first.menu.length > 0);
  const out = monthScore(rows[0], first, null).decision;
  assert.equal(out.apr, toPoints(first.menu[0].tae));
  assert.ok(out.apr >= 1 && out.apr <= 30, `TAE en puntos, no fracción: ${out.apr}`);
  assert.equal(out.baseApr, BANDA[first.bandaEfectiva].baseApr);
  const b = out.aprBreakdown;
  const sum = b.base + b.tenorPremium + b.confidencePremium + b.trendAdjustment + b.forecastPremium;
  assert.ok(Math.abs(sum - out.apr) < 0.011, `desglose ${sum} ≠ TAE ${out.apr}`);
  for (const option of out.menu) assert.ok(option.apr >= 1 && option.apr <= 30);
});

test("limit es el vigente: el mes de apertura coincide con L y el siguiente lo hereda como previo", () => {
  const open = monthScore(rows[0], decisions[0], null).decision;
  assert.equal(decisions[0].accion, "abrir");
  assert.equal(open.limit, decisions[0].LVigente);
  assert.equal(open.limit, decisions[0].L);
  assert.equal(open.previousLimit, 0);
  assert.equal(open.operatingLimit, decisions[0].L);
  assert.equal(Math.max(...open.menu.map((o) => o.maxAmount)), open.limit);

  const next = monthScore(rows[1], decisions[1], null, decisions[0]).decision;
  assert.equal(next.previousLimit, open.limit);
  assert.equal(next.limit, decisions[1].LVigente);
});
