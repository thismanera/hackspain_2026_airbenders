import assert from "node:assert/strict";
import test from "node:test";
import { fitPercentiles, groupSplit } from "@/lib/features/scoring/fit";

test("split is deterministic, disjoint and by group", () => {
  const groups = ["g1", "g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10"];
  const s = groupSplit(groups);
  assert.deepEqual(s, groupSplit([...groups].reverse()));
  assert.ok(s.train.every((g) => !s.validation.includes(g)));
  assert.equal(s.train.length + s.validation.length, 10);
  assert.equal(s.train.length, 7);
});

test("percentiles use only confident samples and freeze into a version", () => {
  const samples = Array.from({ length: 100 }, (_, i) => ({ id: "A1" as const, raw: i / 100, conf: i < 50 ? 0.2 : 1 }));
  const p = fitPercentiles(samples, ["g1"], ["g2"], "fp");
  assert.ok(p.percentiles.A1.p5 >= 0.5);
  assert.ok(p.percentiles.A1.p95 <= 0.99 + 1e-9);
  assert.equal(p.percentiles.C6.p5, 0); // sin muestras → [0, 1]
  assert.equal(p.percentiles.C6.p95, 1);
  assert.equal(p.version.length, 64);
  assert.notEqual(p.version, fitPercentiles(samples, ["g1"], ["g2"], "other").version);
});
