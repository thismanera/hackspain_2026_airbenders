import assert from "node:assert/strict";
import test from "node:test";
import { coste, tae } from "@/lib/features/decision/interest";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";

test("TAE = base + tenor premium + confidence premium ± trend + forecast premium", () => {
  const r = scoreRowFixture({ confianza: 0.9 });
  assert.deepEqual(tae("A", 30, r, "A"), {
    tae: 0.05,
    desglose: {
      base: 0.05,
      primaPlazo: 0,
      primaConfianza: 0,
      ajusteTendencia: 0,
      primaPrevision: 0,
    },
  });
  assert.equal(tae("A", 180, r, "A").tae, 0.075);
  assert.equal(tae("B", 60, scoreRowFixture({ score: 65, confianza: 0.65 }), "B").tae, 0.085);
  assert.equal(tae("A", 30, scoreRowFixture({ direccion: "mejora" }), "A").tae, 0.045);
  assert.equal(tae("A", 30, scoreRowFixture({ direccion: "deterioro" }), "A").tae, 0.06);
  assert.equal(tae("A", 30, r, "B").tae, 0.055);
  assert.equal(tae("D", 30, r, "D").tae, null);
  assert.equal(coste(10_000, 0.06, 90), 150);
});

test("the forecast premium compares against the current band, not the effective one", () => {
  // score 80 → banda actual A; el deterioro estructural deja la efectiva en B (SOURCE §3.3 dice
  // "banda actual": contra la efectiva la previsión B quedaría empatada y la prima se perdería).
  const r = scoreRowFixture({
    score: 80,
    confianza: 0.9,
    direccion: "deterioro",
    naturaleza: "estructural",
  });
  const conPrevision = tae("B", 30, r, "B");
  assert.equal(conPrevision.desglose!.primaPrevision, 0.005);
  assert.equal(conPrevision.tae, 0.085); // 0,07 + 0,01 deterioro + 0,005 previsión
  // Previsión igual a la banda actual: sin prima.
  assert.equal(tae("B", 30, r, "A").desglose!.primaPrevision, 0);
});

test("premiums stack: band B, 180 d, low confidence, deterioration and a worse forecast", () => {
  const r = scoreRowFixture({
    score: 65, // banda actual B
    confianza: 0.65,
    direccion: "deterioro",
    naturaleza: "temporal",
  });
  const t = tae("B", 180, r, "C");
  assert.deepEqual(t.desglose, {
    base: 0.07,
    primaPlazo: 0.025, // 5 escalones de 30 d por encima de 30
    primaConfianza: 0.01,
    ajusteTendencia: 0.01,
    primaPrevision: 0.005,
  });
  assert.equal(t.tae, 0.12);
});
