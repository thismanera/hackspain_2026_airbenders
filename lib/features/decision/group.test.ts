import assert from "node:assert/strict";
import test from "node:test";
import { ajusteGrupo, limiteGrupo } from "@/lib/features/decision/group";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";

const base = {
  cobrosOpGrupoMedia6m: 300_000,
  pagosOpGrupoMedia6m: 200_000,
  servicioDeudaGrupoMedia6m: 10_000,
};

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

test("ceiling prorates limits; cross-default flags siblings of a fallen company", () => {
  const rows = [
    scoreRowFixture({ company: "a", score: 80, D1: 0.5, ...base }),
    scoreRowFixture({ company: "b", score: 80, D1: 0.5, ...base }),
  ];
  const dec = [
    { company: "a", accion: "cerrar" as const, L: 0, LVigente: 0, bandaEfectiva: "D" as const },
    {
      company: "b",
      accion: "mantener" as const,
      L: 100_000,
      LVigente: 100_000,
      bandaEfectiva: "A" as const,
    },
  ];
  const out = ajusteGrupo(rows, dec, 60_000);
  // Σ LVigente = 100 000 > techo 60 000 ⇒ prorrateo puro: 100 000 × 60 000 / 100 000 = 60 000.
  // El escalón extra de banda por el cross-default lo aplica el engine (§9, Tarea 9), no `group.ts`.
  assert.equal(out.decisiones.find((d) => d.company === "b")!.LVigente, 60_000);
  assert.equal(out.decisiones.find((d) => d.company === "a")!.LVigente, 0);
  assert.deepEqual([...out.caidas], ["a"]);
  assert.deepEqual(out.afectadas, ["b"]);
  assert.match(out.motivoGrupo!, /Techo de grupo/);
});

test("no ceiling and no cross-default leaves decisions untouched", () => {
  const rows = [
    scoreRowFixture({ company: "a", score: 80, D1: 0.2, ...base }),
    scoreRowFixture({ company: "b", score: 80, D1: 0.5, ...base }),
  ];
  const dec = [
    { company: "a", accion: "cerrar" as const, L: 0, LVigente: 0, bandaEfectiva: "D" as const },
    {
      company: "b",
      accion: "mantener" as const,
      L: 20_000,
      LVigente: 20_000,
      bandaEfectiva: "A" as const,
    },
  ];
  const out = ajusteGrupo(rows, dec, 60_000);
  assert.equal(out.decisiones.find((d) => d.company === "b")!.LVigente, 20_000);
  // "a" cierra pero su D1 (0,2) no llega al umbral de cross-default (0,3)
  assert.deepEqual([...out.caidas], []);
  assert.deepEqual(out.afectadas, []);
  assert.equal(out.motivoGrupo, null);
});
