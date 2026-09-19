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

test("percentiles use only confident samples and anchored ratios stay out of p5/p95", () => {
  const samples = Array.from({ length: 100 }, (_, i) => ({
    id: "A1" as const,
    raw: i / 100,
    conf: i < 50 ? 0.2 : 1,
  }));
  const p = fitPercentiles(samples, ["g1"], ["g2"], "fp");
  assert.equal(p.percentiles.A1.p5, null);
  assert.equal(p.percentiles.A1.p95, null);
  assert.equal(p.percentiles.C6.p5, null); // sin muestras → subnota neutral
  assert.equal(p.percentiles.C6.p95, null);
  assert.equal(p.version.length, 64);
  assert.notEqual(p.version, fitPercentiles(samples, ["g1"], ["g2"], "other").version);
});

test("conf exactly at the threshold counts", () => {
  const p = fitPercentiles([{ id: "C3", raw: 7, conf: 0.5 }], ["g1"], [], "fp");
  assert.equal(p.percentiles.C3.p5, 7);
  assert.equal(p.percentiles.C3.p95, 7);
  const q = fitPercentiles([{ id: "C3", raw: 7, conf: 0.49 }], ["g1"], [], "fp");
  assert.equal(q.percentiles.C3.p5, null);
});

test("version tracks the percentiles, not just the inputs metadata", () => {
  const a = fitPercentiles([{ id: "C3", raw: 1, conf: 1 }], ["g1"], ["g2"], "fp");
  const b = fitPercentiles([{ id: "C3", raw: 2, conf: 1 }], ["g1"], ["g2"], "fp");
  assert.notEqual(a.version, b.version);
});

test("fit freezes the C5 p80 threshold for chronic instability", () => {
  const samples = Array.from({ length: 10 }, (_, i) => ({
    id: "C5" as const,
    raw: i / 10,
    conf: 1,
  }));
  const p = fitPercentiles(samples, ["g1"], [], "fp");
  assert.equal(typeof p.c5P80, "number");
  assert.ok((p.c5P80 ?? 0) > 0.6);
});
