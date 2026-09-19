import assert from "node:assert/strict";
import { test } from "node:test";

import {
  allowedFacts,
  inventedNumbers,
  resolveReading,
  sanitizeReading,
  templateReading,
} from "./reading";
import { getCompanyFile } from "./source";

function file() {
  const found = getCompanyFile("COMP_1268", "2026-08");
  assert.ok(found);
  return found;
}

test("sin generador se queda en la plantilla determinista", async () => {
  const reading = await resolveReading("decision", file());
  assert.equal(reading.source, "plantilla");
  assert.match(reading.headline, /129\.000/);
});

test("un número que no está en la ficha tumba la lectura de Helmcode", async () => {
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

test("una cita inventada también tumba la lectura", async () => {
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

test("si el modelo inventa un importe, se conserva la plantilla", async () => {
  const reading = await resolveReading("decision", file(), async () => ({
    headline: "Abre línea por 8.500.000 €.",
    sentences: [{ text: "Ese número no está en la cascada.", citations: [] }],
  }));
  assert.equal(reading.source, "plantilla");
  assert.match(reading.headline, /129\.000/);
});

test("si el JSON es válido y solo usa cifras de la ficha, se acepta", async () => {
  const current = file();
  const fallback = templateReading("score", current);
  const reading = await resolveReading("score", current, async () => ({
    headline: fallback.headline,
    sentences: fallback.sentences,
  }));
  assert.equal(reading.source, "helmcode");
  assert.equal(reading.headline, fallback.headline);
});

test("inventedNumbers ignora cifras ya presentes en la plantilla", () => {
  const current = file();
  const fallback = templateReading("improvement", current);
  const { numbers } = allowedFacts(current, fallback);
  assert.equal(inventedNumbers(fallback.headline, numbers).length, 0);
});
