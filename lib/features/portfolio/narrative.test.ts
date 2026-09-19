import assert from "node:assert/strict";
import { test } from "node:test";

import { decisionNarrative, improvementNarrative } from "./narrative";
import { getCompanyFile } from "./source";

test("el cierre nombra la puerta una vez, no el eslogan ni un delta que sube", () => {
  const file = getCompanyFile("COMP_1268", "2026-08");
  assert.ok(file, "COMP_1268 debería existir en los fixtures");
  const narrative = decisionNarrative(file);
  const text = [narrative.headline, ...narrative.sentences.map((sentence) => sentence.text)].join(
    " ",
  );

  assert.match(narrative.headline, /129\.000/);
  assert.doesNotMatch(text, /grifo/i);
  assert.doesNotMatch(text, /margen de caja/i);
  assert.match(text, /obligaci/i);
  assert.equal(narrative.sentences.filter((sentence) => /cierra/i.test(sentence.text)).length, 0);
});

test("la palanca de B2 habla de pagar, no de bajar una racha", () => {
  const file = getCompanyFile("COMP_1268", "2026-08");
  assert.ok(file);
  const text = improvementNarrative(file)
    .sentences.map((sentence) => sentence.text)
    .join(" ");
  assert.match(text, /pagar las obligaciones esperadas/);
  assert.doesNotMatch(text, /bajar racha de retraso/);
});
