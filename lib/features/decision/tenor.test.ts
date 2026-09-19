import assert from "node:assert/strict";
import test from "node:test";
import { tMax } from "@/lib/features/decision/tenor";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";

test("T_max by band and trend, worst of current and predicted band (decision 37)", () => {
  assert.equal(tMax(scoreRowFixture({ score: 80 }), "A"), 180);
  assert.equal(
    tMax(scoreRowFixture({ score: 80, direccion: "deterioro", naturaleza: "temporal" }), "A"),
    120,
  );
  assert.equal(
    tMax(scoreRowFixture({ score: 80, direccion: "deterioro", naturaleza: "estructural" }), "A"),
    60,
  );
  assert.equal(tMax(scoreRowFixture({ score: 65 }), "A"), 120);
  assert.equal(tMax(scoreRowFixture({ score: 80 }), "C"), 60); // previsión peor acorta
  assert.equal(
    tMax(scoreRowFixture({ score: 50, direccion: "deterioro", naturaleza: "estructural" }), "C"),
    0,
  );
  assert.equal(tMax(scoreRowFixture({ score: 40 }), "A"), 0);
});

test("the deterioration columns of the table are read per band (decision 20)", () => {
  const b = (naturaleza: "temporal" | "estructural") =>
    tMax(scoreRowFixture({ score: 65, direccion: "deterioro", naturaleza }), "A");
  assert.equal(b("temporal"), 90); // banda B, temporal
  assert.equal(b("estructural"), 30); // banda B, estructural: sigue dentro de la fila B
  assert.equal(
    tMax(scoreRowFixture({ score: 50, direccion: "deterioro", naturaleza: "temporal" }), "A"),
    30, // banda C, temporal
  );
});
