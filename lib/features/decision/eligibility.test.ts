import assert from "node:assert/strict";
import test from "node:test";
import { decisionInputFixture } from "@/lib/features/decision/__fixtures__/decision-input";
import { elegibilidad } from "@/lib/features/decision/eligibility";
import { proyectar } from "@/lib/features/decision/input";
import {
  ESTADO_INICIAL,
  type DecisionInput,
  type EstadoDecision,
  type Puerta,
} from "@/lib/features/decision/types";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";
import type { AlertTipo } from "@/lib/features/scoring/types";

const crossDefault: EstadoDecision = {
  ...ESTADO_INICIAL,
  crossDefaultActivo: true,
  causaCrossDefault: "COMP_X",
};

const alerta = (tipo: AlertTipo): Partial<DecisionInput> => ({ alertas: [tipo] });

test("a healthy row passes every gate", () => {
  const e = elegibilidad(decisionInputFixture(), ESTADO_INICIAL);
  assert.equal(e.elegible, true);
  assert.equal(e.motivo, null);
  assert.deepEqual(e.puertasFallidas, []);
  assert.equal(e.cajaSoloCapacidad, false);
});

test("decisión 44: cada puerta de pilar falla sola en su umbral, y sola por su alerta", () => {
  const casos: {
    puerta: Puerta;
    patch: Partial<DecisionInput>;
    prev: EstadoDecision;
    motivo: RegExp;
  }[] = [
    {
      puerta: "historia",
      patch: { confianza: 0.3 },
      prev: ESTADO_INICIAL,
      motivo: /Historial insuficiente: confianza 0,30 < 0,4/,
    },
    {
      puerta: "estado",
      patch: { score: 40 },
      prev: ESTADO_INICIAL,
      motivo: /^Score 40 por debajo de 45$/,
    },
    {
      puerta: "fiabilidad",
      patch: { subscores: { A: 80, B: 59.9, C: 80 } },
      prev: ESTADO_INICIAL,
      motivo: /^Fiabilidad 59,9 por debajo de 60$/,
    },
    {
      puerta: "fiabilidad",
      patch: alerta("impago_obligaciones"),
      prev: ESTADO_INICIAL,
      motivo: /^Impago de obligaciones \(alerta\)$/,
    },
    {
      puerta: "caja",
      patch: { subscores: { A: 49.9, B: 80, C: 80 } },
      prev: ESTADO_INICIAL,
      motivo: /^Capacidad de deuda 49,9 por debajo de 50$/,
    },
    {
      puerta: "caja",
      patch: alerta("deficit_persistente"),
      prev: ESTADO_INICIAL,
      motivo: /^Déficit persistente \(alerta\)$/,
    },
    {
      puerta: "clientes",
      patch: { subscores: { A: 80, B: 80, C: 49.9 } },
      prev: ESTADO_INICIAL,
      motivo: /^Clientes 49,9 por debajo de 50$/,
    },
    {
      puerta: "clientes",
      patch: alerta("vencido_alto"),
      prev: ESTADO_INICIAL,
      motivo: /^Vencido alto \(alerta\)$/,
    },
    {
      puerta: "grupo",
      patch: {},
      prev: crossDefault,
      motivo: /Cierre de COMP_X/,
    },
  ];
  for (const { puerta, patch, prev, motivo } of casos) {
    const e = elegibilidad(decisionInputFixture(patch), prev);
    assert.equal(e.elegible, false, `${puerta}: debería fallar`);
    assert.deepEqual(e.puertasFallidas, [puerta], `${puerta}: solo esa puerta`);
    assert.match(e.motivo!, motivo);
  }
});

test("every threshold: the value at the limit passes, one notch worse fails", () => {
  const umbrales: {
    puerta: Puerta;
    pasa: Partial<DecisionInput>;
    falla: Partial<DecisionInput>;
  }[] = [
    { puerta: "historia", pasa: { confianza: 0.4 }, falla: { confianza: 0.39 } },
    { puerta: "estado", pasa: { score: 45 }, falla: { score: 44.9 } },
    {
      puerta: "fiabilidad",
      pasa: { subscores: { A: 80, B: 60, C: 80 } },
      falla: { subscores: { A: 80, B: 59.9, C: 80 } },
    },
    {
      puerta: "caja",
      pasa: { subscores: { A: 50, B: 80, C: 80 } },
      falla: { subscores: { A: 49.9, B: 80, C: 80 } },
    },
    {
      puerta: "clientes",
      pasa: { subscores: { A: 80, B: 80, C: 50 } },
      falla: { subscores: { A: 80, B: 80, C: 49.9 } },
    },
  ];
  for (const { puerta, pasa, falla } of umbrales) {
    assert.deepEqual(
      elegibilidad(decisionInputFixture(pasa), ESTADO_INICIAL).puertasFallidas,
      [],
      `${puerta}: el valor del umbral pasa`,
    );
    assert.deepEqual(
      elegibilidad(decisionInputFixture(falla), ESTADO_INICIAL).puertasFallidas,
      [puerta],
      `${puerta}: un escalón peor falla`,
    );
  }
});

test("decisión 43: las alertas que no son de puerta no cierran nada", () => {
  for (const tipo of [
    "deterioro",
    "deterioro_estructural",
    "recuperacion",
    "contagio_grupo",
    "datos_insuficientes",
  ] as const)
    assert.deepEqual(
      elegibilidad(decisionInputFixture(alerta(tipo)), ESTADO_INICIAL).puertasFallidas,
      [],
      tipo,
    );
});

test("gates fail in the documented order and all failures are listed", () => {
  const r = decisionInputFixture({
    confianza: 0.3,
    score: 40,
    subscores: { A: 10, B: 10, C: 10 },
    alertas: ["impago_obligaciones", "deficit_persistente", "vencido_alto"],
  });
  const e = elegibilidad(r, crossDefault);
  assert.equal(e.elegible, false);
  assert.deepEqual(e.puertasFallidas, [
    "historia",
    "estado",
    "fiabilidad",
    "caja",
    "clientes",
    "grupo",
  ]);
  assert.match(e.motivo!, /Historial insuficiente: confianza 0,30 < 0,4/);
});

test("decisión 42 + 44: `cajaSoloCapacidad` separa el umbral del pilar de la alerta", () => {
  const pilar = elegibilidad(
    decisionInputFixture({ subscores: { A: 40, B: 80, C: 80 } }),
    ESTADO_INICIAL,
  );
  assert.deepEqual(pilar.puertasFallidas, ["caja"]);
  assert.equal(pilar.cajaSoloCapacidad, true);

  // Alerta de déficit persistente: puerta dura, aunque el pilar A esté de sobra.
  const alertaDeficit = elegibilidad(
    decisionInputFixture(alerta("deficit_persistente")),
    ESTADO_INICIAL,
  );
  assert.deepEqual(alertaDeficit.puertasFallidas, ["caja"]);
  assert.equal(alertaDeficit.cajaSoloCapacidad, false);

  // Las dos mitades caídas a la vez siguen siendo un fallo duro.
  const ambas = elegibilidad(
    decisionInputFixture({ subscores: { A: 40, B: 80, C: 80 }, ...alerta("deficit_persistente") }),
    ESTADO_INICIAL,
  );
  assert.equal(ambas.cajaSoloCapacidad, false);
});

test("decisión 43: el motor decide sobre la proyección, no sobre la fila de score", () => {
  // La fila trae flujos, rachas y C4 catastróficos; ninguno entra ya en el contrato, así que la
  // empresa pasa las seis puertas con su score, sus pilares y sin alertas.
  const e = elegibilidad(
    proyectar(
      scoreRowFixture({
        rachaB2: 9,
        rachaDeficit: 9,
        C4: 0.99,
        capacidadCuotaAdv: 0,
        cobrosOpMedia6m: 0,
        pagosOpMedia6m: 1_000_000,
      }),
    ),
    ESTADO_INICIAL,
  );
  assert.equal(e.elegible, true);
});
