import assert from "node:assert/strict";
import { test } from "node:test";

import { portfolioFrom } from "./derive";
import { buildPortfolio } from "./fixtures";
import { deriveBanda } from "./vocabulary";

const portfolio = buildPortfolio();
const dataset = { companies: portfolio };
const everyMonth = [...portfolio.values()].flatMap((entry) => entry.months);

test("todos los meses de los fixtures llevan previsión en modo sombra y dentro de rango", () => {
  for (const month of everyMonth) {
    const forecast = month.forecast;
    assert.ok(forecast, `${month.company} ${month.month} sin previsión`);
    assert.equal(forecast.metodoSolo, "desconectado");
    for (const value of [
      forecast.scoreSoloPred3m,
      forecast.scoreSoloPred6m,
      forecast.p10Solo3m,
      forecast.p90Solo3m,
      forecast.p10Solo6m,
      forecast.p90Solo6m,
    ]) {
      assert.ok(value >= 0 && value <= 100, `${month.company} ${month.month}: ${value}`);
    }
    assert.ok(forecast.p10Solo3m <= forecast.scoreSoloPred3m);
    assert.ok(forecast.scoreSoloPred3m <= forecast.p90Solo3m);
    assert.equal(forecast.bandaSoloPred3m, deriveBanda(forecast.scoreSoloPred3m));
    assert.equal(forecast.impact.bandPred, forecast.bandaSoloPred3m);
    assert.equal(forecast.impact.bandNow, month.decision.band);
  }
});

test("los primeros meses no tienen tendencia y la previsión repite el score", () => {
  for (const entry of portfolio.values()) {
    const first = entry.months[0]!;
    assert.equal(first.forecast?.sinTendencia, true);
    assert.equal(first.forecast?.scoreSoloPred3m, Math.round(first.score * 10) / 10);
  }
});

test("la cartera resume y filtra por previsión", () => {
  const all = portfolioFrom(dataset);
  const { bandUp, bandDown } = all.summary.forecast;
  assert.equal(
    all.rows.filter((row) => row.forecast?.impact.tone === "deterioro").length,
    bandDown,
  );
  const down = portfolioFrom(dataset, { prevision: "baja_banda" });
  assert.equal(down.rows.length, bandDown);
  for (const row of down.rows) assert.equal(row.forecast?.impact.tone, "deterioro");
  const up = portfolioFrom(dataset, { prevision: "sube_banda" });
  assert.equal(up.rows.length, bandUp);
});
