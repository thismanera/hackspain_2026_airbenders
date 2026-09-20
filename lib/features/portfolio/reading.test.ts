import assert from "node:assert/strict";
import { test } from "node:test";

import {
  allowedFacts,
  inventedNumbers,
  READING_KINDS,
  readingFor,
  readingSetSchema,
  readingsFor,
  sanitizeReading,
  templateReading,
} from "./reading";
import { CURATED_PARAMETER_VERSION, curatedKeys, curatedReading } from "./readings.curated";
import { companyFileFrom } from "./derive";
import { buildPortfolio } from "./fixtures";

const dataset = { companies: buildPortfolio() };

function file() {
  const found = companyFileFrom(dataset, "COMP_1268", "2026-08");
  assert.ok(found);
  return found;
}

test("sin lectura curada se persiste la plantilla determinista", () => {
  const reading = readingFor("decision", file(), "test");
  assert.equal(reading.source, "plantilla");
  assert.match(reading.headline, /129\.000/);
});

test("el conjunto persistido trae las cuatro lecturas y pasa su esquema", () => {
  const set = readingsFor(file(), "test");
  assert.deepEqual(Object.keys(set).sort(), [...READING_KINDS].sort());
  assert.ok(readingSetSchema.safeParse(JSON.parse(JSON.stringify(set))).success);
});

test("un número que no está en la ficha tumba la lectura", () => {
  const current = file();
  const fallback = templateReading("decision", current);
  assert.equal(
    sanitizeReading(
      {
        headline: "Hay que prestar 999 millones.",
        sentences: [{ text: "El motor no ha dicho esa cifra.", citations: [] }],
      },
      current,
      fallback,
    ),
    null,
  );
});

test("una cita inventada también tumba la lectura", () => {
  const current = file();
  const fallback = templateReading("decision", current);
  assert.equal(
    sanitizeReading(
      {
        headline: fallback.headline,
        sentences: [{ text: fallback.headline, citations: [{ ref: "Z99", label: "Inventado" }] }],
      },
      current,
      fallback,
    ),
    null,
  );
});

test("una lectura que solo usa cifras de la ficha se acepta", () => {
  const current = file();
  const fallback = templateReading("score", current);
  const clean = sanitizeReading(
    { headline: fallback.headline, sentences: fallback.sentences },
    current,
    fallback,
  );
  assert.ok(clean);
  assert.equal(clean.headline, fallback.headline);
});

test("inventedNumbers ignora cifras ya presentes en la plantilla", () => {
  const current = file();
  const fallback = templateReading("improvement", current);
  const { numbers } = allowedFacts(current, fallback);
  assert.equal(inventedNumbers(fallback.headline, numbers).length, 0);
});

test("una lectura curada solo se aplica al run cuyos parámetros la produjeron", () => {
  const key = curatedKeys()[0];
  assert.ok(key);
  assert.ok(curatedReading(CURATED_PARAMETER_VERSION, key.companyId, key.month, key.kind));
  assert.equal(curatedReading("otro-run", key.companyId, key.month, key.kind), null);
});

test("las lecturas curadas apuntan a fichas del calendario y a kinds válidos", () => {
  const keys = curatedKeys();
  assert.ok(keys.length > 0);
  for (const key of keys) {
    assert.match(key.companyId, /^COMP_\d{4}$/);
    assert.match(key.month, /^\d{4}-(0[1-9]|1[0-2])$/);
    assert.ok(READING_KINDS.includes(key.kind));
  }
});
