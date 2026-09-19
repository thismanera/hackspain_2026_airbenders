import assert from "node:assert/strict";
import test from "node:test";
import { flujosCapacidad } from "@/lib/features/decision/__fixtures__/flujos";
import { elegibilidad } from "@/lib/features/decision/eligibility";
import { ESTADO_INICIAL, type EstadoDecision, type Puerta } from "@/lib/features/decision/types";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";
import type { ScoreRow } from "@/lib/features/scoring/types";

const crossDefault: EstadoDecision = {
  ...ESTADO_INICIAL,
  crossDefaultActivo: true,
  causaCrossDefault: "COMP_X",
};

test("a healthy row passes every gate", () => {
  const e = elegibilidad(scoreRowFixture(), ESTADO_INICIAL);
  assert.equal(e.elegible, true);
  assert.equal(e.motivo, null);
  assert.deepEqual(e.puertasFallidas, []);
  assert.equal(e.cajaSoloCapacidad, false);
});

test("each gate fails on its own, with its own motivo", () => {
  const casos: {
    puerta: Puerta;
    patch: Partial<ScoreRow>;
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
      motivo: /Score 40 por debajo de 45/,
    },
    {
      puerta: "fiabilidad",
      patch: { rachaB2: 2 },
      prev: ESTADO_INICIAL,
      motivo: /2 meses seguidos sin pagar obligaciones/,
    },
    {
      puerta: "caja",
      patch: { rachaDeficit: 3 },
      prev: ESTADO_INICIAL,
      motivo: /3 meses seguidos en déficit/,
    },
    {
      puerta: "caja",
      patch: flujosCapacidad(0),
      prev: ESTADO_INICIAL,
      motivo: /Caja estresada no cubre cuotas actuales/,
    },
    {
      puerta: "clientes",
      patch: { C4: 0.5 },
      prev: ESTADO_INICIAL,
      motivo: /50 % de facturas vencidas sin cobrar/,
    },
    {
      puerta: "grupo",
      patch: {},
      prev: crossDefault,
      motivo: /Cierre de COMP_X/,
    },
  ];
  for (const { puerta, patch, prev, motivo } of casos) {
    const e = elegibilidad(scoreRowFixture(patch), prev);
    assert.equal(e.elegible, false, `${puerta}: debería fallar`);
    assert.deepEqual(e.puertasFallidas, [puerta], `${puerta}: solo esa puerta`);
    assert.match(e.motivo!, motivo);
  }
});

test("every threshold: the value at the limit passes, one notch worse fails", () => {
  const umbrales: { puerta: Puerta; pasa: Partial<ScoreRow>; falla: Partial<ScoreRow> }[] = [
    { puerta: "historia", pasa: { confianza: 0.4 }, falla: { confianza: 0.39 } },
    { puerta: "estado", pasa: { score: 45 }, falla: { score: 44.9 } },
    { puerta: "fiabilidad", pasa: { rachaB2: 1 }, falla: { rachaB2: 2 } },
    { puerta: "caja", pasa: { rachaDeficit: 2 }, falla: { rachaDeficit: 3 } },
    { puerta: "caja", pasa: flujosCapacidad(1), falla: flujosCapacidad(0) },
    { puerta: "clientes", pasa: { C4: 0.4 }, falla: { C4: 0.41 } },
    { puerta: "clientes", pasa: { C4: null }, falla: { C4: 0.41 } },
  ];
  for (const { puerta, pasa, falla } of umbrales) {
    assert.deepEqual(
      elegibilidad(scoreRowFixture(pasa), ESTADO_INICIAL).puertasFallidas,
      [],
      `${puerta}: el valor del umbral pasa`,
    );
    assert.deepEqual(
      elegibilidad(scoreRowFixture(falla), ESTADO_INICIAL).puertasFallidas,
      [puerta],
      `${puerta}: un escalón peor falla`,
    );
  }
});

test("gates fail in the documented order and all failures are listed", () => {
  const r = scoreRowFixture({
    confianza: 0.3,
    score: 40,
    rachaB2: 2,
    rachaDeficit: 3,
    ...flujosCapacidad(0),
    C4: 0.5,
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

test("decisión 40: la puerta `caja` mira la capacidad del motor de decisión, no la de la fila", () => {
  // La fila trae `capacidadCuotaAdv: 0` (estrés de scoring) pero sus flujos dan capacidad > 0 con
  // el estrés de decisión: la puerta pasa. Es exactamente el caso que la decisión 40 desbloquea.
  const e = elegibilidad(
    scoreRowFixture({ ...flujosCapacidad(10_000), capacidadCuotaAdv: 0 }),
    ESTADO_INICIAL,
  );
  assert.equal(e.elegible, true);
});

test("decisión 42: `cajaSoloCapacidad` separa la mitad blanda de la puerta de la dura", () => {
  const capacidad = elegibilidad(scoreRowFixture(flujosCapacidad(0)), ESTADO_INICIAL);
  assert.deepEqual(capacidad.puertasFallidas, ["caja"]);
  assert.equal(capacidad.cajaSoloCapacidad, true);

  // Racha de déficit: puerta dura, aunque haya capacidad de sobra.
  const racha = elegibilidad(
    scoreRowFixture({ ...flujosCapacidad(10_000), rachaDeficit: 3 }),
    ESTADO_INICIAL,
  );
  assert.deepEqual(racha.puertasFallidas, ["caja"]);
  assert.equal(racha.cajaSoloCapacidad, false);

  // Las dos condiciones caídas a la vez siguen siendo un fallo duro.
  const ambas = elegibilidad(
    scoreRowFixture({ ...flujosCapacidad(0), rachaDeficit: 3 }),
    ESTADO_INICIAL,
  );
  assert.equal(ambas.cajaSoloCapacidad, false);
});
