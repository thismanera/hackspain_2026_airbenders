import assert from "node:assert/strict";
import test from "node:test";
import { DECISION_PARAMS, hashDecisionParams } from "@/lib/features/decision/params";

test("bands are ordered and the menu tenors are ascending", () => {
  const { bandas, plazosMenu, tMax } = DECISION_PARAMS;
  assert.ok(bandas.A > bandas.B && bandas.B > bandas.C);
  assert.deepEqual(
    [...plazosMenu],
    [...plazosMenu].sort((a, b) => a - b),
  );
  for (const b of ["A", "B", "C", "D"] as const)
    assert.ok(tMax[b].base >= tMax[b].temporal && tMax[b].temporal >= tMax[b].estructural);
  assert.equal(tMax.C.estructural, 0);
});

test("hash is canonical and sensitive", () => {
  assert.equal(hashDecisionParams(DECISION_PARAMS), hashDecisionParams({ ...DECISION_PARAMS }));
  assert.notEqual(
    hashDecisionParams(DECISION_PARAMS),
    hashDecisionParams({ ...DECISION_PARAMS, histeresisPct: 0.3 }),
  );
});
