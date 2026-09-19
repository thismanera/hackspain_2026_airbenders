import assert from "node:assert/strict";
import { test } from "node:test";

import { CALENDAR } from "./calendar";
import { buildPortfolio } from "./fixtures";
import { getCompanyFile, getPortfolio } from "./source";

const portfolio = buildPortfolio();
const everyMonth = [...portfolio.values()].flatMap((entry) => entry.months);

test("la cascada suma exactamente el score en solitario", () => {
  for (const month of everyMonth) {
    const summed = month.contributions.reduce((total, item) => total + item.contribution, 0);
    assert.ok(
      Math.abs(summed - month.standaloneScore) < 0.05,
      `${month.company} ${month.month}: contribuciones suman ${summed}, score ${month.standaloneScore}`,
    );
  }
});

test("el score final es el score en solitario más el ajuste de grupo", () => {
  for (const month of everyMonth) {
    const expected = Math.min(
      100,
      Math.max(0, month.standaloneScore + (month.group?.adjustment ?? 0)),
    );
    assert.ok(Math.abs(month.score - expected) < 0.05, `${month.company} ${month.month}`);
  }
});

test("score y confianza se quedan dentro de rango", () => {
  for (const month of everyMonth) {
    assert.ok(month.score >= 0 && month.score <= 100, `score fuera de rango: ${month.score}`);
    assert.ok(month.confidence >= 0 && month.confidence <= 1, `confianza: ${month.confidence}`);
  }
});

test("una empresa no elegible no tiene límite ni menú", () => {
  for (const month of everyMonth) {
    if (month.decision.eligible) continue;
    assert.equal(month.decision.limit, 0, `${month.company} ${month.month} no elegible con límite`);
    assert.equal(month.decision.menu.length, 0);
    assert.equal(month.decision.action, "cerrar");
  }
});

test("una empresa elegible tiene límite, plazo y al menos una opción", () => {
  for (const month of everyMonth) {
    if (!month.decision.eligible) continue;
    assert.ok(month.decision.limit > 0, `${month.company} ${month.month} elegible sin límite`);
    assert.ok(month.decision.maxTenorDays > 0);
    assert.ok(month.decision.menu.length > 0);
    for (const option of month.decision.menu) {
      assert.ok(option.maxAmount <= month.decision.limit, "una opción supera el límite");
      assert.ok(option.days <= month.decision.maxTenorDays, "una opción supera el plazo máximo");
    }
  }
});

test("el límite nunca se mueve más de un 25 % de un mes al siguiente salvo cierre", () => {
  for (const entry of portfolio.values()) {
    for (let index = 1; index < entry.months.length; index++) {
      const previous = entry.months[index - 1].decision.limit;
      const current = entry.months[index].decision.limit;
      if (previous === 0 || current === 0) continue;
      const change = Math.abs(current / previous - 1);
      assert.ok(change <= 0.26, `${entry.meta.id} ${entry.months[index].month}: ${change}`);
    }
  }
});

test("toda alerta se detecta antes o a la vez que se confirma", () => {
  for (const month of everyMonth) {
    for (const alert of month.alerts) {
      assert.ok(
        CALENDAR.indexOf(alert.onsetMonth) <= CALENDAR.indexOf(alert.confirmedMonth),
        `${month.company}: ${alert.onsetMonth} > ${alert.confirmedMonth}`,
      );
      assert.ok(CALENDAR.indexOf(alert.confirmedMonth) <= CALENDAR.indexOf(month.month));
    }
  }
});

test("la banda se corresponde con el score", () => {
  for (const month of everyMonth) {
    const expected =
      month.score >= 75 ? "A" : month.score >= 60 ? "B" : month.score >= 45 ? "C" : "D";
    assert.equal(month.decision.band, expected, `${month.company} ${month.month}`);
  }
});

test("la cartera devuelve filas ordenadas por quién necesita atención", () => {
  const { rows, summary } = getPortfolio();
  assert.ok(rows.length > 0);
  assert.equal(summary.total, rows.length);

  const priority = { cerrar: 0, reducir: 1, abrir: 2, ampliar: 3, mantener: 4 };
  const rank = (row: (typeof rows)[number]) =>
    !row.changed && row.action === "cerrar" ? 5 : priority[row.action];
  for (let index = 1; index < rows.length; index++) {
    assert.ok(rank(rows[index - 1]) <= rank(rows[index]), "el orden por acción se ha roto");
  }
});

test("seguir sin línea no cuenta como movimiento del mes", () => {
  const { rows, summary } = getPortfolio();
  const neverOpened = rows.filter((row) => row.action === "cerrar" && row.previousLimit === 0);
  assert.ok(neverOpened.every((row) => !row.changed));
  assert.equal(summary.moved, rows.filter((row) => row.changed).length);
});

test("los filtros reducen la lista sin perder el total sin filtrar", () => {
  const all = getPortfolio();
  const onlyRisk = getPortfolio({ estado: "riesgo" });
  assert.equal(onlyRisk.totalUnfiltered, all.totalUnfiltered);
  assert.ok(onlyRisk.rows.every((row) => row.estado === "riesgo"));
  assert.ok(onlyRisk.rows.length <= all.rows.length);
});

test("hot solo señala cambios estructurales, del mayor al menor, y sobrevive al filtro", () => {
  const all = getPortfolio();
  assert.ok(all.hot.length <= 8);
  for (const [index, row] of all.hot.entries()) {
    assert.equal(row.nature, "estructural", row.company.id);
    assert.equal(row.hot?.rank, index + 1);
    const next = all.hot[index + 1];
    if (next) assert.ok(Math.abs(row.trend3m ?? 0) >= Math.abs(next.trend3m ?? 0));
  }
  const flagged = all.rows.filter((row) => row.hot !== null).map((row) => row.company.id);
  assert.deepEqual(flagged.sort(), all.hot.map((row) => row.company.id).sort());

  const onlyRisk = getPortfolio({ estado: "riesgo" });
  assert.deepEqual(
    onlyRisk.hot.map((row) => row.company.id),
    all.hot.map((row) => row.company.id),
  );
});

test("la estela son como mucho seis meses con tendencia, el actual el último", () => {
  const { rows, month } = getPortfolio();
  for (const row of rows) {
    assert.ok(row.trail.length <= 6);
    if (row.trend3m !== null) {
      const last = row.trail[row.trail.length - 1];
      assert.equal(last?.month, month);
      assert.equal(last?.score, row.score);
    }
  }
});

test("la ficha de una empresa inexistente es nula", () => {
  assert.equal(getCompanyFile("COMP_NO_EXISTE"), null);
});

test("la ficha trae historia hasta el mes pedido y sus hermanas de grupo", () => {
  const first = getPortfolio().rows[0];
  const file = getCompanyFile(first.company.id);
  assert.ok(file);
  assert.equal(file.history.length, CALENDAR.length);
  assert.equal(file.latest.month, file.month);
  assert.equal(file.peers.length, first.company.groupSize - 1);
});
