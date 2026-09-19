import assert from "node:assert/strict";
import test from "node:test";
import { DECISION_PARAMS, hashDecisionParams } from "@/lib/features/decision/params";
import { PUERTAS } from "@/lib/features/decision/types";

test("bands are ordered and the menu tenors are ascending", () => {
  const { bandas, plazosMenu, tMax } = DECISION_PARAMS;
  assert.ok(bandas.A > bandas.B && bandas.B > bandas.C);
  assert.deepEqual(
    [...plazosMenu],
    [...plazosMenu].sort((a, b) => a - b),
  );
  for (const b of ["A", "B", "C", "D"] as const)
    assert.ok(tMax[b].base >= tMax[b].temporal && tMax[b].temporal >= tMax[b].estructural);
  assert.equal(tMax.C.estructural, 0);
});

test("hash is canonical and sensitive", () => {
  assert.equal(hashDecisionParams(DECISION_PARAMS), hashDecisionParams({ ...DECISION_PARAMS }));
  assert.notEqual(
    hashDecisionParams(DECISION_PARAMS),
    hashDecisionParams({ ...DECISION_PARAMS, histeresisPct: 0.3 }),
  );
});

test("decisión 44: umbrales por pilar, y los tres pilares del score están cubiertos", () => {
  const { umbralPilar } = DECISION_PARAMS;
  assert.deepEqual({ ...umbralPilar }, { A: 50, B: 60, C: 50 });
  // los tres umbrales viven en la escala del score (0-100) y por debajo del corte de banda A
  for (const v of Object.values(umbralPilar)) assert.ok(v > 0 && v < DECISION_PARAMS.bandas.A);
  // fiabilidad es el más exigente: no pagar lo que ya se debe es el peor de los tres
  assert.ok(umbralPilar.B > umbralPilar.A && umbralPilar.B > umbralPilar.C);
});

test("decisión 45: el pilar A recorta hasta `factorARef` y no hay capacidad de cuota", () => {
  assert.equal(DECISION_PARAMS.factorARef, 70);
  assert.ok(DECISION_PARAMS.factorARef > DECISION_PARAMS.umbralPilar.A);
  // decisión 43: el estrés y la cobertura eran los parámetros de un cálculo en euros que ya no
  // existe; el motor de decisión no vuelve a medir la caja, se fía del pilar A.
  for (const k of ["estresCobros", "estresPagos", "coberturaMin", "mesesLimiteCap"])
    assert.ok(!(k in DECISION_PARAMS), k);
});

test("decisión 46: la rampa del menú llega a L en el plazo máximo del producto", () => {
  assert.equal(DECISION_PARAMS.rampaDias, 180);
  assert.equal(DECISION_PARAMS.rampaDias, Math.max(...DECISION_PARAMS.plazosMenu));
  assert.equal(DECISION_PARAMS.rampaDias, DECISION_PARAMS.tMax.A.base);
});

test("decisión 47: el techo de grupo ya no tiene regla de techo cero", () => {
  assert.ok(!("techoCeroBajaBanda" in DECISION_PARAMS));
  assert.equal(DECISION_PARAMS.D1CrossDefault, 0.3);
});

test("decisiones 39 y 42: puerta de confianza y puertas blandas", () => {
  assert.equal(DECISION_PARAMS.confMin, 0.4);
  // La confianza sigue descontando límite y precio por encima de la puerta.
  assert.ok(DECISION_PARAMS.confMin < DECISION_PARAMS.confRef);
  assert.deepEqual([...DECISION_PARAMS.puertasBlandas], ["historia", "caja"]);
  for (const p of DECISION_PARAMS.puertasBlandas) assert.ok(PUERTAS.includes(p));
  assert.ok(DECISION_PARAMS.cierreConfirmadoMeses >= 2);
});

test("cambiar cualquiera de los parámetros nuevos cambia el hash (§13, propiedad 6)", () => {
  const base = hashDecisionParams(DECISION_PARAMS);
  for (const patch of [
    { confMin: 0.5 },
    { umbralPilar: { A: 50, B: 60, C: 45 } },
    { factorARef: 60 },
    { rampaDias: 90 },
    { cierreConfirmadoMeses: 1 },
    { puertasBlandas: ["historia"] },
  ])
    assert.notEqual(base, hashDecisionParams({ ...DECISION_PARAMS, ...patch }));
});
