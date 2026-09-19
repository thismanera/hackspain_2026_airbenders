import assert from "node:assert/strict";
import { test } from "node:test";

import { bandFloor, nextBand } from "./band-ladder";

test("en banda A no hay siguiente escalón", () => {
  assert.equal(nextBand(75), null);
  assert.equal(nextBand(92), null);
});

test("el siguiente escalón es la banda inmediatamente superior con sus condiciones", () => {
  assert.deepEqual(nextBand(68), {
    band: "A",
    pointsMissing: 7,
    baseApr: 5,
    maxTenor: 180,
    factor: 1,
  });
  assert.equal(nextBand(52.4)?.band, "B");
  assert.equal(nextBand(52.4)?.pointsMissing, 7.6);
  assert.equal(nextBand(30)?.band, "C");
  assert.equal(nextBand(30)?.pointsMissing, 15);
});

test("el suelo de la banda actual es el umbral que no hay que perder", () => {
  assert.equal(bandFloor(80), 75);
  assert.equal(bandFloor(60), 60);
  assert.equal(bandFloor(45), 45);
  assert.equal(bandFloor(20), null);
});
