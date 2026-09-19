import assert from "node:assert/strict";
import test from "node:test";
import { ajusteGrupo, limiteGrupo, type DecisionMes } from "@/lib/features/decision/group";
import { DECISION_PARAMS as P } from "@/lib/features/decision/params";
import type { Accion, Banda, Puerta } from "@/lib/features/decision/types";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";

const base = {
  cobrosOpGrupoMedia6m: 300_000,
  pagosOpGrupoMedia6m: 200_000,
  servicioDeudaGrupoMedia6m: 10_000,
};

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

test("group limit from consolidated flows", () => {
  const rows = [
    scoreRowFixture({ company: "a", score: 80, confianza: 1, cobrosOpMedia6m: 100_000, ...base }),
    scoreRowFixture({ company: "b", score: 70, confianza: 1, cobrosOpMedia6m: 200_000, ...base }),
  ];
  // capacidad = (0,8×300 000 − 1,1×200 000)/1,3 − 10 000 = (240 000 − 220 000)/1,3 − 10 000 = 5 384,6
  const cap = (0.8 * 300_000 - 1.1 * 200_000) / 1.3 - 10_000;
  const g = limiteGrupo(rows);
  assert.ok(Math.abs(g.capacidad - cap) < 1e-6);
  // score ponderado por cobros = (80×100k + 70×200k)/300k = 73,3 → banda B (factor 0,7); conf 1 → sin recorte
  assert.equal(g.banda, "B");
  assert.equal(g.limiteCap, cap * 12); // 64 615,4
  assert.equal(g.limiteOp, 0.8 * 300_000 * 3); // 720 000
  // L = floor(min(64 615,4; 720 000) × 0,7 / 1000) × 1000 = 45 000
  assert.equal(g.L, Math.floor((Math.min(cap * 12, 0.8 * 300_000 * 3) * 0.7) / 1000) * 1000);
  assert.equal(g.L, 45_000);
});

test("an empty group has no consolidated row to compute from", () => {
  assert.throws(() => limiteGrupo([]), /grupo vacío/);
});

test("the weighted mean falls back to the plain mean when nobody has receipts", () => {
  const rows = [
    scoreRowFixture({ company: "a", score: 80, confianza: 1, cobrosOpMedia6m: 0, ...base }),
    scoreRowFixture({ company: "b", score: 60, confianza: 1, cobrosOpMedia6m: 0, ...base }),
  ];
  // sin peso: media simple (80 + 60)/2 = 70 → banda B, igual que la ponderada de pesos iguales
  assert.equal(limiteGrupo(rows).banda, "B");
  assert.equal(limiteGrupo(rows).L, 45_000);
});

test("ceiling prorates limits; cross-default flags siblings of a fallen company", () => {
  const rows = [
    scoreRowFixture({ company: "a", score: 80, D1: 0.5, ...base }),
    scoreRowFixture({ company: "b", score: 80, D1: 0.5, ...base }),
  ];
  const dec = [decision("a", "cerrar", 0), decision("b", "mantener", 100_000)];
  const out = ajusteGrupo(rows, dec, 60_000);
  // Σ LVigente = 100 000 > techo 60 000 ⇒ prorrateo puro: 100 000 × 60 000 / 100 000 = 60 000.
  // El escalón extra de banda por el cross-default lo aplica el engine (§9, Tarea 9), no `group.ts`.
  assert.equal(out.decisiones.find((d) => d.company === "b")!.LVigente, 60_000);
  assert.equal(out.decisiones.find((d) => d.company === "a")!.LVigente, 0);
  assert.deepEqual(out.caidas, ["a"]);
  assert.deepEqual(out.afectadas, ["b"]);
  assert.match(out.motivoGrupo!, /Techo de grupo/);
});

test("no ceiling and no cross-default leaves decisions untouched", () => {
  const rows = [
    scoreRowFixture({ company: "a", score: 80, D1: 0.2, ...base }),
    scoreRowFixture({ company: "b", score: 80, D1: 0.5, ...base }),
  ];
  const dec = [decision("a", "cerrar", 0), decision("b", "mantener", 20_000)];
  const out = ajusteGrupo(rows, dec, 60_000);
  assert.equal(out.decisiones.find((d) => d.company === "b")!.LVigente, 20_000);
  // "a" cierra pero su D1 (0,2) no llega al umbral de cross-default (0,3)
  assert.deepEqual(out.caidas, []);
  assert.deepEqual(out.afectadas, []);
  assert.equal(out.motivoGrupo, null);
});

test("a closure whose only failing gate is `grupo` is contagion, not a new fall", () => {
  const rows = [
    scoreRowFixture({ company: "a", score: 80, D1: 0.5, ...base }),
    scoreRowFixture({ company: "b", score: 80, D1: 0.5, ...base }),
  ];
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
  const rows = [
    scoreRowFixture({ company: "a", score: 80, D1: 0.5, ...base }),
    scoreRowFixture({ company: "b", score: 80, D1: 0.5, ...base }),
  ];
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
    scoreRowFixture({ company, score: 80, D1: 0.1, ...base }),
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
  const rows = ["a", "b"].map((company) =>
    scoreRowFixture({ company, score: 80, D1: 0.1, ...base }),
  );
  const dec = [decision("a", "mantener", 40_000), decision("b", "mantener", 20_000)];
  const out = ajusteGrupo(rows, dec, 60_000);
  assert.deepEqual(
    out.decisiones.map((d) => d.LVigente),
    [40_000, 20_000],
  );
  assert.equal(out.motivoGrupo, null);
});
