import assert from "node:assert/strict";
import test from "node:test";
import { hashParams, PARAMS } from "@/lib/features/scoring/params";

test("block weights sum to 1 and every variable belongs to one block", () => {
  const { A, B, C } = PARAMS.pesos;
  assert.ok(Math.abs(A + B + C - 1) < 1e-9);
  const all = [...PARAMS.bloques.A, ...PARAMS.bloques.B, ...PARAMS.bloques.C];
  assert.equal(all.length, 14);
  assert.equal(new Set(all).size, 14);
  for (const v of all) assert.ok(v in PARAMS.mejor, `mejor[${v}] missing`);
});

test("hash is stable and changes with any parameter", () => {
  assert.equal(hashParams(PARAMS), hashParams({ ...PARAMS }));
  assert.notEqual(hashParams(PARAMS), hashParams({ ...PARAMS, wMax: 0.5 }));
});
