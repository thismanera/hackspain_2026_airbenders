import assert from "node:assert/strict";
import test from "node:test";
import { DECISION_PARAMS, hashDecisionParams } from "@/lib/features/decision/params";
import { PUERTAS } from "@/lib/features/decision/types";
import { PARAMS } from "@/lib/features/scoring/params";

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

test("decisión 40: el estrés del motor de decisión es propio y más suave que el de scoring", () => {
  const { estresCobros, estresPagos, coberturaMin } = DECISION_PARAMS;
  assert.equal(estresCobros, 0.9);
  assert.equal(estresPagos, 1.05);
  // La cobertura (DSCR 1,3) se mantiene intacta: el escenario adverso se suaviza en los flujos,
  // no en el colchón de servicio de deuda.
  assert.equal(coberturaMin, PARAMS.coberturaMin);
  assert.ok(estresCobros > PARAMS.estresCobros && estresPagos < PARAMS.estresPagos);
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
    { estresCobros: 0.8 },
    { estresPagos: 1.1 },
    { cierreConfirmadoMeses: 1 },
    { puertasBlandas: ["historia"] },
    { techoCeroBajaBanda: false },
  ])
    assert.notEqual(base, hashDecisionParams({ ...DECISION_PARAMS, ...patch }));
});
