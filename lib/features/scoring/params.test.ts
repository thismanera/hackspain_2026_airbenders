import assert from "node:assert/strict";
import test from "node:test";
import { hashParams, PARAMS, VARIABLES } from "@/lib/features/scoring/params";

test("block weights sum to 1 and the blocks partition VARIABLES exactly", () => {
  const { A, B, C } = PARAMS.pesos;
  assert.ok(Math.abs(A + B + C - 1) < 1e-9);
  const all = [...PARAMS.bloques.A, ...PARAMS.bloques.B, ...PARAMS.bloques.C];
  assert.deepEqual([...all].sort(), [...VARIABLES].sort());
  assert.equal(new Set(all).size, VARIABLES.length);
  for (const v of all) assert.ok(v in PARAMS.mejor, `mejor[${v}] missing`);
});

test("hash is canonical: stable under key reordering, sensitive to every parameter", () => {
  assert.equal(hashParams(PARAMS), hashParams({ ...PARAMS }));
  const reordered = Object.fromEntries(
    Object.entries(PARAMS)
      .reverse()
      .map(([k, v]) => [
        k,
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.fromEntries(Object.entries(v).reverse())
          : v,
      ]),
  );
  assert.equal(hashParams(reordered), hashParams(PARAMS));
  for (const key of Object.keys(PARAMS))
    assert.notEqual(
      hashParams({ ...PARAMS, [key]: "__tweaked__" }),
      hashParams(PARAMS),
      `hash ignores ${key}`,
    );
});
