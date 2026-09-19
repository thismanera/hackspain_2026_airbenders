import assert from "node:assert/strict";
import test from "node:test";
import { decisionInputFixture } from "@/lib/features/decision/__fixtures__/decision-input";
import {
  bajarBanda,
  banda,
  bandaEfectiva,
  factorA,
  limite,
  peor,
} from "@/lib/features/decision/limit";
import { DECISION_PARAMS as P } from "@/lib/features/decision/params";

test("bands from score, effective band lowered on structural deterioration", () => {
  assert.equal(banda(75), "A");
  assert.equal(banda(74.9), "B");
  assert.equal(banda(60), "B");
  assert.equal(banda(45), "C");
  assert.equal(banda(44), "D");
  assert.equal(bajarBanda("A"), "B");
  assert.equal(bajarBanda("D"), "D");
  assert.equal(
    bandaEfectiva(
      decisionInputFixture({ score: 80, direccion: "deterioro", naturaleza: "estructural" }),
    ),
    "B",
  );
  assert.equal(
    bandaEfectiva(
      decisionInputFixture({ score: 80, direccion: "deterioro", naturaleza: "temporal" }),
    ),
    "A",
  );
  assert.equal(bandaEfectiva(decisionInputFixture({ score: 80 }), 1), "B");
  assert.equal(peor("A", "C"), "C");
  assert.equal(peor("B", "A"), "B");
});

test("decisión 45: L = 0,8 × tamaño × 3 × factor_banda × recorte de confianza × factor_A", () => {
  // fixture sana de decision-engine §13: tamaño 100 k/mes, conf 0,9, pilar A 80
  const r = decisionInputFixture();
  const l = limite(r, "A");
  assert.equal(l.limiteOp, 240_000);
  assert.equal(l.factorA, 1);
  assert.equal(l.L, 240_000);
  assert.equal(limite(r, "B").L, 168_000);
  assert.equal(limite(r, "C").L, 96_000);
  assert.equal(limite(r, "D").L, 0);
  // recorte de confianza: min(1; 0,3/0,6) = 0,5
  assert.equal(limite(decisionInputFixture({ confianza: 0.3 }), "A").L, 120_000);
  // redondeo abajo al escalón de 1.000 €
  assert.equal(limite(decisionInputFixture({ tamano: 5_432 }), "A").L, 13_000);
  // sin cobros no hay escala y no hay límite
  assert.equal(limite(decisionInputFixture({ tamano: 0 }), "A").L, 0);
});

test("decisión 45: el pilar A recorta el límite hasta `factorARef` y deja de recortar por encima", () => {
  assert.equal(P.factorARef, 70);
  assert.equal(factorA(70), 1);
  assert.equal(factorA(100), 1);
  assert.equal(factorA(35), 0.5);
  assert.equal(factorA(0), 0);
  // A 35 = la mitad de `factorARef`: el límite se parte por la mitad
  const mitad = limite(decisionInputFixture({ subscores: { A: 35, B: 80, C: 80 } }), "A");
  assert.equal(mitad.factorA, 0.5);
  assert.equal(mitad.L, 120_000);
  // A 70 y A 100 dan el mismo límite: el recorte solo actúa por debajo de la referencia
  assert.equal(
    limite(decisionInputFixture({ subscores: { A: 70, B: 80, C: 80 } }), "A").L,
    240_000,
  );
  assert.equal(
    limite(decisionInputFixture({ subscores: { A: 100, B: 80, C: 80 } }), "A").L,
    240_000,
  );
});

test("decisión 45: el límite escala con el tamaño y nada más lo mueve", () => {
  const doble = limite(decisionInputFixture({ tamano: 200_000 }), "A");
  assert.equal(doble.L, 480_000);
  // la tendencia, el estado y las alertas no entran en la fórmula del límite
  const ruido = limite(
    decisionInputFixture({
      estado: "riesgo",
      tendScore3m: -12,
      alertas: ["deterioro", "contagio_grupo"],
    }),
    "A",
  );
  assert.equal(ruido.L, 240_000);
});
