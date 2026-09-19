import assert from "node:assert/strict";
import { test } from "node:test";

import { CALENDAR, LATEST_MONTH } from "./calendar";
import { companyFileFrom } from "./derive";
import { buildPortfolio } from "./fixtures";
import { peerMapFrom } from "./peer-map";
import type { Scope } from "./types";

const dataset = { companies: buildPortfolio() };
const getPeerMap = (input: { month?: string; scope: Scope; company?: string }) =>
  peerMapFrom(dataset, input);
const getCompanyFile = (companyId: string, month?: string) =>
  companyFileFrom(dataset, companyId, month);

const DEMO = "COMP_0357";

test("el mapa de pares tiene un punto por empresa, dentro del cubo", () => {
  const map = getPeerMap({ scope: "partner" });
  assert.equal(map.month, LATEST_MONTH);
  assert.equal(map.points.length, 44);
  for (const point of map.points) {
    for (const p of [point.pos, ...point.trail]) {
      if (p === null) continue;
      for (const value of p) assert.ok(value >= -1 && value <= 1, `${point.key} fuera del cubo`);
    }
  }
  assert.equal(map.axes.length, 3);
  const total = map.axes.reduce((sum, axis) => sum + axis.explained, 0);
  assert.ok(total > 0 && total <= 1);
  for (const axis of map.axes) assert.equal(axis.top.length, 3);
});

test("scope empresa: solo la que consulta lleva nombre; las demás no filtran ni score", () => {
  const map = getPeerMap({ scope: "embat", company: DEMO });
  assert.equal(map.focus, DEMO);
  const named = map.points.filter((point) => point.company !== null);
  assert.deepEqual(
    named.map((point) => point.company),
    [DEMO],
  );
  for (const point of map.points) {
    if (point.company === DEMO) continue;
    assert.equal(point.score, null);
    assert.equal(point.deltaTrail, null);
    assert.ok(!point.key.includes("COMP_"), "la clave anónima no delata el id");
  }
  assert.ok(!JSON.stringify(map).includes("COMP_0001"));
});

test("scope partner: hoy todas llevan nombre (el opt-in llega en otra tarea)", () => {
  const map = getPeerMap({ scope: "partner" });
  assert.equal(map.points.filter((point) => point.company === null).length, 0);
  assert.equal(map.focus, null);
});

test("la estela va alineada con los meses y termina en el mes pedido", () => {
  const latest = getPeerMap({ scope: "partner" });
  assert.equal(latest.months.length, 12);
  assert.equal(latest.months.at(-1), LATEST_MONTH);
  for (const point of latest.points) {
    assert.equal(point.trail.length, latest.months.length);
    assert.deepEqual(point.trail.at(-1), point.pos);
  }

  const early = getPeerMap({ scope: "partner", month: CALENDAR[2] });
  assert.deepEqual(early.months, CALENDAR.slice(0, 3));
  for (const point of early.points) assert.equal(point.trail.length, 3);
});

test("pos es null exactamente cuando la empresa no tiene datos ese mes", () => {
  const month = CALENDAR[1];
  const map = getPeerMap({ scope: "partner", month });
  for (const point of map.points) {
    const file = getCompanyFile(point.company!, month);
    assert.ok(file);
    const observed = file.latest.coverage.observedMonths > 0;
    assert.equal(point.pos !== null, observed, `${point.company} en ${month}`);
    assert.equal(point.cluster !== null, observed);
  }
});

test("los clusters son continuos entre dos meses consecutivos", () => {
  const a = getPeerMap({ scope: "partner", month: CALENDAR[CALENDAR.length - 2] });
  const b = getPeerMap({ scope: "partner", month: LATEST_MONTH });
  assert.equal(a.clusters.length, 5);
  assert.equal(b.clusters.length, 5);
  const byId = new Map(a.points.map((point) => [point.company, point.cluster]));
  const comparable = b.points.filter(
    (point) => point.cluster !== null && byId.get(point.company) != null,
  );
  const same = comparable.filter((point) => byId.get(point.company) === point.cluster).length;
  assert.ok(same / comparable.length >= 0.8, `${same}/${comparable.length} conservan cluster`);
  for (const cluster of b.clusters) {
    assert.ok(cluster.label.length > 0);
    assert.equal(cluster.size, b.points.filter((point) => point.cluster === cluster.id).length);
  }
});
