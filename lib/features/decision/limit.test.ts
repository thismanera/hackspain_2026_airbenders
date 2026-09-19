import assert from "node:assert/strict";
import test from "node:test";
import { bajarBanda, banda, bandaEfectiva, limite, peor } from "@/lib/features/decision/limit";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";

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
      scoreRowFixture({ score: 80, direccion: "deterioro", naturaleza: "estructural" }),
    ),
    "B",
  );
  assert.equal(
    bandaEfectiva(scoreRowFixture({ score: 80, direccion: "deterioro", naturaleza: "temporal" })),
    "A",
  );
  assert.equal(bandaEfectiva(scoreRowFixture({ score: 80 }), 1), "B");
  assert.equal(peor("A", "C"), "C");
  assert.equal(peor("B", "A"), "B");
});

test("limit = min(cap×12, 0.8×3m cobros) × factor × confianza haircut, rounded down to 1000", () => {
  // fixture sana de decision-engine §13: cap 10 k/mes, cobros 100 k/mes, conf 0,9
  const r = scoreRowFixture({
    capacidadCuotaAdv: 10_000,
    cobrosOpMedia3m: 100_000,
    confianza: 0.9,
    score: 82,
  });
  const l = limite(r, "A");
  assert.equal(l.limiteCap, 120_000);
  assert.equal(l.limiteOp, 240_000);
  assert.equal(l.L, 120_000);
  assert.equal(limite(r, "B").L, 84_000);
  assert.equal(limite(r, "C").L, 48_000);
  assert.equal(limite(r, "D").L, 0);
  assert.equal(
    limite(
      scoreRowFixture({ capacidadCuotaAdv: 10_000, cobrosOpMedia3m: 100_000, confianza: 0.3 }),
      "A",
    ).L,
    60_000,
  );
  assert.equal(
    limite(
      scoreRowFixture({ capacidadCuotaAdv: 1_234.5, cobrosOpMedia3m: 100_000, confianza: 1 }),
      "A",
    ).L,
    14_000,
  );
});

test("the operating limit binds when receipts are small next to the instalment capacity", () => {
  // cap × 12 = 600 000 pero 0,8 × 100 000 × 3 = 240 000: manda `limiteOp`.
  const r = scoreRowFixture({ capacidadCuotaAdv: 50_000, cobrosOpMedia3m: 100_000, confianza: 1 });
  const l = limite(r, "A");
  assert.equal(l.limiteCap, 600_000);
  assert.equal(l.limiteOp, 240_000);
  assert.ok(l.limiteOp < l.limiteCap);
  assert.equal(l.L, 240_000);
  assert.equal(limite(r, "B").L, 168_000); // 240 000 × 0,7
});
