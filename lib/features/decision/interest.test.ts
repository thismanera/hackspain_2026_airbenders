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
  assert.equal(tae("B", 60, scoreRowFixture({ confianza: 0.65 }), "B").tae, 0.085);
  assert.equal(tae("A", 30, scoreRowFixture({ direccion: "mejora" }), "A").tae, 0.045);
  assert.equal(tae("A", 30, scoreRowFixture({ direccion: "deterioro" }), "A").tae, 0.06);
  assert.equal(tae("A", 30, r, "B").tae, 0.055);
  assert.equal(tae("D", 30, r, "D").tae, null);
  assert.equal(coste(10_000, 0.06, 90), 150);
});
