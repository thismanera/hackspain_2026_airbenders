import assert from "node:assert/strict";
import test from "node:test";
import { elegibilidad } from "@/lib/features/decision/eligibility";
import { ESTADO_INICIAL } from "@/lib/features/decision/types";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";

test("a healthy row passes every gate", () => {
  const r = scoreRowFixture({ capacidadCuotaAdv: 5_000 });
  const e = elegibilidad(r, ESTADO_INICIAL);
  assert.equal(e.elegible, true);
  assert.equal(e.motivo, null);
  assert.deepEqual(e.puertasFallidas, []);
});

test("gates fail in the documented order and all failures are listed", () => {
  const r = scoreRowFixture({
    confianza: 0.4,
    score: 40,
    rachaB2: 2,
    rachaDeficit: 3,
    capacidadCuotaAdv: 0,
    C4: 0.5,
  });
  const e = elegibilidad(r, {
    ...ESTADO_INICIAL,
    crossDefaultActivo: true,
    causaCrossDefault: "COMP_X",
  });
  assert.equal(e.elegible, false);
  assert.deepEqual(e.puertasFallidas, [
    "historia",
    "estado",
    "fiabilidad",
    "caja",
    "clientes",
    "grupo",
  ]);
  assert.match(e.motivo!, /Historial insuficiente: confianza 0,40 < 0,5/);
});

test("C4 null does not block; capacity 0 blocks; cross-default blocks", () => {
  assert.equal(
    elegibilidad(scoreRowFixture({ C4: null, capacidadCuotaAdv: 1 }), ESTADO_INICIAL).elegible,
    true,
  );
  const caja = elegibilidad(scoreRowFixture({ capacidadCuotaAdv: 0 }), ESTADO_INICIAL);
  assert.deepEqual(caja.puertasFallidas, ["caja"]);
  assert.match(caja.motivo!, /Caja estresada no cubre cuotas actuales/);
  const g = elegibilidad(scoreRowFixture({ capacidadCuotaAdv: 1, D1: 0.2 }), {
    ...ESTADO_INICIAL,
    crossDefaultActivo: true,
    causaCrossDefault: "COMP_9",
  });
  assert.match(g.motivo!, /Cierre de COMP_9/);
});
