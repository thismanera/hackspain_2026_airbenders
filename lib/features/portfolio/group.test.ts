import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPortfolio } from "./fixtures";
import { decisionNarrative, groupNarrative, improvementNarrative } from "./narrative";
import { companyFileFrom, groupFileFrom, portfolioFrom } from "./derive";

const portfolio = buildPortfolio();
const dataset = { companies: portfolio };
const groups = [...new Set([...portfolio.values()].map((entry) => entry.meta.groupId))];

test("la ficha de grupo consolida exactamente a sus empresas", () => {
  for (const groupId of groups) {
    const group = groupFileFrom(dataset, groupId);
    assert.ok(group, `grupo ${groupId} sin ficha`);
    const expected = [...portfolio.values()].filter((entry) => entry.meta.groupId === groupId);
    assert.equal(group.members.length, expected.length);

    const exposure = group.members.reduce((sum, member) => sum + member.limit, 0);
    assert.equal(group.exposure, exposure);
    assert.equal(group.eligible, group.members.filter((member) => member.eligible).length);

    const estados = Object.values(group.byEstado).reduce((sum, count) => sum + count, 0);
    assert.equal(estados, group.members.length);

    const totalShare = group.members.reduce((sum, member) => sum + member.share, 0);
    const weighted =
      group.members.reduce((sum, member) => sum + member.score * member.share, 0) / totalShare;
    assert.ok(Math.abs(group.score - weighted) < 0.05, `${groupId}: ${group.score} vs ${weighted}`);
    assert.equal(group.history[group.history.length - 1].score, group.score);
  }
});

test("el peso de una empresa en la tabla coincide con el de su ficha de grupo", () => {
  const { rows } = portfolioFrom(dataset, {});
  for (const row of rows) {
    const group = groupFileFrom(dataset, row.company.groupId, row.month)!;
    const member = group.members.find((entry) => entry.id === row.company.id)!;
    assert.equal(row.share, member.share);
    assert.equal(row.limit, member.limit);
  }
});

test("un grupo desconocido no tiene ficha", () => {
  assert.equal(groupFileFrom(dataset, "GRUPO_INEXISTENTE"), null);
});

test("las narrativas citan solo variables o puertas que existen en la ficha", () => {
  for (const entry of portfolio.values()) {
    const file = companyFileFrom(dataset, entry.meta.id)!;
    const known = new Set([
      ...file.latest.contributions.map((c) => c.indicator),
      ...file.latest.decision.gates.map((g) => `puerta:${g.id}`),
      ...file.latest.alerts.map((a) => a.indicator),
      "banda",
      "grupo",
      "tendencia",
      "confianza",
    ]);
    for (const narrative of [decisionNarrative(file), improvementNarrative(file)]) {
      assert.ok(narrative.headline.length > 0);
      for (const sentence of narrative.sentences) {
        for (const citation of sentence.citations) {
          assert.ok(known.has(citation.ref), `${entry.meta.id}: cita desconocida ${citation.ref}`);
        }
      }
    }
    const group = groupNarrative(groupFileFrom(dataset, entry.meta.groupId)!);
    assert.ok(group.headline.length > 0);
  }
});
