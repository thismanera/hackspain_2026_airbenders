import assert from "node:assert/strict";
import test from "node:test";
import { decisionInputFixture } from "@/lib/features/decision/__fixtures__/decision-input";
import { ajusteGrupo, limiteGrupo, type DecisionMes } from "@/lib/features/decision/group";
import { DECISION_PARAMS as P } from "@/lib/features/decision/params";
import type { Accion, Banda, Puerta } from "@/lib/features/decision/types";

function decision(
  company: string,
  accion: Accion,
  LVigente: number,
  p: Partial<DecisionMes> = {},
): DecisionMes {
  return {
    company,
    accion,
    L: LVigente,
    LVigente,
    bandaEfectiva: (accion === "cerrar" ? "D" : "A") as Banda,
    puertasFallidas: (accion === "cerrar" ? ["estado"] : []) as Puerta[],
    yaCerrada: false,
    ...p,
  };
}

test("decisión 47: el techo del grupo es la fórmula de §4 sobre Σ tamaño", () => {
  const rows = [
    decisionInputFixture({ company: "a", score: 80, confianza: 1, tamano: 100_000 }),
    decisionInputFixture({ company: "b", score: 70, confianza: 1, tamano: 200_000 }),
  ];
  const g = limiteGrupo(rows);
  assert.equal(g.tamano, 300_000);
  assert.equal(g.limiteOp, 0.8 * 300_000 * 3); // 720 000
  // score ponderado por tamaño = (80×100k + 70×200k)/300k = 73,33 → banda B (factor 0,7)
  assert.ok(Math.abs(g.score - 73.333) < 0.01);
  assert.equal(g.banda, "B");
  assert.equal(g.confianza, 1); // sin recorte
  assert.equal(g.factorA, 1); // pilares A 80 > factorARef
  assert.equal(g.L, 504_000); // 720 000 × 0,7
});

test("decisión 47: score, confianza y pilar A van ponderados por tamaño", () => {
  // La grande manda: score 80 con 900 k frente a score 20 con 100 k → media 74 → banda B.
  const rows = [
    decisionInputFixture({ company: "a", score: 80, confianza: 1, tamano: 900_000 }),
    decisionInputFixture({
      company: "b",
      score: 20,
      confianza: 0.3,
      subscores: { A: 10, B: 10, C: 10 },
      tamano: 100_000,
    }),
  ];
  const g = limiteGrupo(rows);
  assert.equal(g.tamano, 1_000_000);
  assert.ok(Math.abs(g.score - 74) < 1e-9);
  assert.equal(g.banda, "B");
  assert.ok(Math.abs(g.confianza - 0.93) < 1e-9); // (1×900k + 0,3×100k)/1M
  assert.equal(g.factorA, 1); // A ponderado = (80×900k + 10×100k)/1M = 73 > factorARef
  // Con los pesos invertidos la pequeña sana no salva al grupo: media 26 → banda D → L = 0.
  const invertido = limiteGrupo([
    decisionInputFixture({ company: "a", score: 80, confianza: 1, tamano: 100_000 }),
    decisionInputFixture({
      company: "b",
      score: 20,
      confianza: 0.3,
      subscores: { A: 10, B: 10, C: 10 },
      tamano: 900_000,
    }),
  ]);
  assert.equal(invertido.banda, "D");
  assert.equal(invertido.L, 0);
});

test("decisión 47: el pilar A también recorta el techo del grupo", () => {
  const rows = ["a", "b"].map((company) =>
    decisionInputFixture({
      company,
      score: 80,
      confianza: 1,
      subscores: { A: 35, B: 80, C: 80 },
      tamano: 100_000,
    }),
  );
  const g = limiteGrupo(rows);
  assert.equal(g.factorA, 0.5);
  assert.equal(g.L, 240_000); // 0,8 × 200 000 × 3 × 1 × 1 × 0,5
});

test("an empty group has no members to compute from", () => {
  assert.throws(() => limiteGrupo([]), /grupo vacío/);
});

test("the weighted mean falls back to the plain mean when nobody has receipts", () => {
  const rows = [
    decisionInputFixture({ company: "a", score: 80, confianza: 1, tamano: 0 }),
    decisionInputFixture({ company: "b", score: 60, confianza: 1, tamano: 0 }),
  ];
  const g = limiteGrupo(rows);
  assert.equal(g.score, 70); // media simple
  assert.equal(g.banda, "B");
  // Σ tamaño = 0 ⇒ no hay anticipo que repartir, y el límite individual de cada miembro también es 0
  assert.equal(g.tamano, 0);
  assert.equal(g.L, 0);
});

test("ceiling prorates limits; cross-default flags siblings of a fallen company", () => {
  const rows = [
    decisionInputFixture({ company: "a", score: 80, D1: 0.5 }),
    decisionInputFixture({ company: "b", score: 80, D1: 0.5 }),
  ];
  const dec = [decision("a", "cerrar", 0), decision("b", "mantener", 100_000)];
  const out = ajusteGrupo(rows, dec, 60_000);
  // Σ LVigente = 100 000 > techo 60 000 ⇒ prorrateo puro: 100 000 × 60 000 / 100 000 = 60 000.
  // El escalón extra de banda por el cross-default lo aplica el engine (§9, paso 2), no `group.ts`.
  assert.equal(out.decisiones.find((d) => d.company === "b")!.LVigente, 60_000);
  assert.equal(out.decisiones.find((d) => d.company === "a")!.LVigente, 0);
  assert.deepEqual(out.caidas, ["a"]);
  assert.deepEqual(out.afectadas, ["b"]);
  assert.equal(out.modo, "prorrateo");
  assert.match(out.motivoGrupo!, /Techo de grupo/);
});

test("no ceiling and no cross-default leaves decisions untouched", () => {
  const rows = [
    decisionInputFixture({ company: "a", score: 80, D1: 0.2 }),
    decisionInputFixture({ company: "b", score: 80, D1: 0.5 }),
  ];
  const dec = [decision("a", "cerrar", 0), decision("b", "mantener", 20_000)];
  const out = ajusteGrupo(rows, dec, 60_000);
  assert.equal(out.decisiones.find((d) => d.company === "b")!.LVigente, 20_000);
  // "a" cierra pero su D1 (0,2) no llega al umbral de cross-default (0,3)
  assert.deepEqual(out.caidas, []);
  assert.deepEqual(out.afectadas, []);
  assert.equal(out.modo, null);
  assert.equal(out.motivoGrupo, null);
});

test("decisión 47: con techo 0 el prorrateo es la única regla; no hay bajada de banda", () => {
  // `L_grupo = 0` solo pasa en banda D o con Σ tamaño = 0, y entonces el prorrateo a cero es
  // exactamente lo que se quiere: la regla del techo cero (decisión 41) se queda sin objeto.
  const rows = ["a", "b"].map((company) => decisionInputFixture({ company, score: 40, D1: 0.1 }));
  const out = ajusteGrupo(rows, [decision("a", "mantener", 50_000), decision("b", "abrir", 0)], 0);
  assert.equal(out.modo, "prorrateo");
  assert.deepEqual(
    out.decisiones.map((d) => d.LVigente),
    [0, 0],
  );
  assert.match(out.motivoGrupo!, /Techo de grupo: 0 €/);
  // Con todos a cero no hay techo que aplicar y no se marca nada.
  const nadie = ajusteGrupo(rows, [decision("a", "cerrar", 0), decision("b", "cerrar", 0)], 0);
  assert.equal(nadie.modo, null);
  assert.equal(nadie.motivoGrupo, null);
});

test("a closure whose only failing gate is `grupo` is contagion, not a new fall", () => {
  const rows = ["a", "b"].map((company) => decisionInputFixture({ company, score: 80, D1: 0.5 }));
  const heredado = ajusteGrupo(
    rows,
    [decision("a", "mantener", 20_000), decision("b", "cerrar", 0, { puertasFallidas: ["grupo"] })],
    600_000,
  );
  assert.deepEqual(heredado.caidas, []); // si contase, "a" quedaría marcada por el contagio que ella misma causó
  // con una puerta propia además de "grupo" sí es caída
  const propio = ajusteGrupo(
    rows,
    [
      decision("a", "mantener", 20_000),
      decision("b", "cerrar", 0, { puertasFallidas: ["estado", "grupo"] }),
    ],
    600_000,
  );
  assert.deepEqual(propio.caidas, ["b"]);
});

test("a company that arrived already closed is not a new fall", () => {
  const rows = ["a", "b"].map((company) => decisionInputFixture({ company, score: 80, D1: 0.5 }));
  const out = ajusteGrupo(
    rows,
    [decision("a", "cerrar", 0, { yaCerrada: true }), decision("b", "mantener", 20_000)],
    600_000,
  );
  assert.deepEqual(out.caidas, []);
  assert.deepEqual(out.afectadas, []);
});

test("three companies prorate with flooring: Σ stays under the ceiling", () => {
  const rows = ["a", "b", "c"].map((company) =>
    decisionInputFixture({ company, score: 80, D1: 0.1 }),
  );
  // Σ = 100 000 y techo 70 000: cada una × 0,7 y redondeada abajo al escalón de 1 000.
  const dec = [
    decision("a", "mantener", 50_000),
    decision("b", "mantener", 33_000),
    decision("c", "mantener", 17_000),
  ];
  const out = ajusteGrupo(rows, dec, 70_000);
  const porEmpresa = new Map(out.decisiones.map((d) => [d.company, d.LVigente]));
  assert.deepEqual([...porEmpresa.values()], [35_000, 23_000, 11_000]);
  const suma = out.decisiones.reduce((s, d) => s + d.LVigente, 0);
  assert.equal(suma, 69_000);
  assert.ok(suma <= 70_000); // el redondeo abajo nunca puede pasarse del techo
  for (const d of out.decisiones) assert.equal(d.LVigente % P.redondeoL, 0);
});

test("Σ exactly equal to the ceiling is left untouched", () => {
  const rows = ["a", "b"].map((company) => decisionInputFixture({ company, score: 80, D1: 0.1 }));
  const dec = [decision("a", "mantener", 40_000), decision("b", "mantener", 20_000)];
  const out = ajusteGrupo(rows, dec, 60_000);
  assert.deepEqual(
    out.decisiones.map((d) => d.LVigente),
    [40_000, 20_000],
  );
  assert.equal(out.motivoGrupo, null);
});
