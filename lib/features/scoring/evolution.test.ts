import assert from "node:assert/strict";
import test from "node:test";
import {
  computeAlerts,
  deltas,
  detectarInflexion,
  diagnosticoMejora,
  direccion,
  naturaleza,
} from "@/lib/features/scoring/evolution";
import type { Contribution, Senales } from "@/lib/features/scoring/types";

function c(id: Contribution["id"], aportacion: number): Contribution {
  return {
    id,
    raw: null,
    subnota: 50,
    conf: 1,
    peso: 0,
    pesoEfectivo: 0,
    aportacion,
    umbralSano: null,
    sano: null,
    aplicable: true,
  };
}
const flags = (p: Partial<Senales>): Senales => ({
  deterioro: false,
  estructural: false,
  mejora: false,
  deficit: false,
  impago: false,
  vencidoAlto: false,
  contagio: false,
  datosInsuficientes: false,
  alertaTempranaDeterioro: false,
  ...p,
});

test("direction needs a 6-point move over 3 months", () => {
  assert.equal(direccion(60, 66), "deterioro");
  assert.equal(direccion(66, 60), "mejora");
  assert.equal(direccion(63, 60), "estable");
  assert.equal(direccion(63, null), "estable");
  assert.equal(direccion(70, 60, 80), "estable"); // 3m and 6m disagree
});

test("naturaleza: structural needs persistence, two variables and a level variable", () => {
  const now = [c("A1", 5), c("A2", 8), c("C5", 4)];
  const three = [c("A1", 8), c("A2", 10), c("C5", 4)];
  assert.equal(naturaleza("deterioro", ["deterioro"], now, three), "estructural");
  assert.equal(naturaleza("deterioro", ["mejora", "deterioro"], now, three), "estructural");
  assert.equal(naturaleza("deterioro", ["deterioro", "estable"], now, three), "temporal");
  assert.equal(naturaleza("deterioro", ["estable"], now, three), "temporal");
  assert.equal(naturaleza("deterioro", [], now, three), "temporal"); // sin historia previa
  assert.equal(naturaleza("deterioro", ["deterioro"], now, null), "temporal");
  assert.equal(
    naturaleza("deterioro", ["deterioro"], [c("A1", 5), c("C5", 1)], [c("A1", 8), c("C5", 4)]),
    "estructural",
  );
  assert.equal(
    naturaleza("deterioro", ["deterioro"], [c("C5", 1), c("C6", 1)], [c("C5", 4), c("C6", 4)]),
    "temporal",
  );
  assert.equal(naturaleza("estable", ["estable"], now, three), "sin_cambio");
});

test("deltas decompose exactly and are zero without a previous month", () => {
  const d = deltas([c("A1", 5), c("C1", 2)], [c("A1", 8), c("C1", -1)]);
  assert.deepEqual(d, [
    { id: "A1", delta: -3 },
    { id: "C1", delta: 3 },
  ]);
  assert.deepEqual(deltas([c("A1", 5), c("C1", 2)], null), [
    { id: "A1", delta: 0 },
    { id: "C1", delta: 0 },
  ]);
});

test("alerts with persistence and onset month", () => {
  const prev = [flags({ deterioro: true }), flags({ deterioro: true, deficit: true })]; // t-2, t-1
  const now = flags({ deterioro: true, deficit: true, vencidoAlto: true });
  const a = computeAlerts(now, prev, ["2025-01", "2025-02", "2025-03"]);
  assert.deepEqual(
    a.find((x) => x.tipo === "deterioro"),
    { tipo: "deterioro", desdeMes: "2025-01" },
  );
  assert.equal(
    a.some((x) => x.tipo === "deficit_persistente"),
    false,
  ); // solo 2 meses
  assert.deepEqual(
    a.find((x) => x.tipo === "vencido_alto"),
    { tipo: "vencido_alto", desdeMes: "2025-03" },
  );
  assert.equal(computeAlerts(flags({ deterioro: true }), [], ["2025-01"]).length, 0); // necesita 2 meses
});

test("a broken run restarts the onset month", () => {
  const prev = [
    flags({ deterioro: true }), // 2025-01
    flags({}), // 2025-02: corta la racha
    flags({ deterioro: true }), // 2025-03
  ];
  const a = computeAlerts(flags({ deterioro: true }), prev, [
    "2025-01",
    "2025-02",
    "2025-03",
    "2025-04",
  ]);
  assert.deepEqual(
    a.find((x) => x.tipo === "deterioro"),
    { tipo: "deterioro", desdeMes: "2025-03" },
  );
});

function evolutionRow(month: string, scoreSolo: number, scoreGrupo = scoreSolo, a1 = 50) {
  return {
    month,
    scoreSolo,
    scoreGrupo,
    aportacionGrupo: scoreGrupo - scoreSolo,
    variables: [c("A1", a1)],
  };
}

test("bidirectional inflection needs two strict monthly moves and names the initial trigger", () => {
  const down = detectarInflexion(
    [
      evolutionRow("2025-01", 80, 82, 60),
      evolutionRow("2025-02", 76, 77, 56),
      evolutionRow("2025-03", 72, 70, 55),
    ],
    false,
  );
  assert.equal(down.tipo, "pico_bajista");
  assert.equal(down.mesInflexion, "2025-01");
  assert.equal(down.variableDetonante, "A1");
  const up = detectarInflexion(
    [
      evolutionRow("2025-01", 40, 40, 20),
      evolutionRow("2025-02", 44, 48, 24),
      evolutionRow("2025-03", 48, 55, 25),
    ],
    true,
  );
  assert.equal(up.tipo, "suelo_alcista");
  assert.equal(up.mesInflexion, "2025-01");
  assert.equal(up.scoreInflexion, 40);
  assert.equal(
    detectarInflexion([evolutionRow("2025-01", 80), evolutionRow("2025-03", 70)], false)
      .hayInflexion,
    false,
  );
});

test("confirmed improvement requires monotonic monthly score and A1/A2 contribution growth", () => {
  const current = { scoreSolo: 72, tendScore3m: 8, variables: [c("A1", 12), c("A2", 10)] };
  const previous = { scoreSolo: 70, variables: [c("A1", 11), c("A2", 9)] };
  const three = { variables: [c("A1", 8), c("A2", 9)] };
  assert.deepEqual(
    diagnosticoMejora(current, previous, three, [{ scoreSolo: 68 }, { scoreSolo: 70 }, current]),
    {
      confirmada: true,
      motor: "A1",
    },
  );
  assert.equal(diagnosticoMejora(current, { ...previous, scoreSolo: 73 }, three).confirmada, false);
});
