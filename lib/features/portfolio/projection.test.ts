import assert from "node:assert/strict";
import { test } from "node:test";

import { CUBE_EDGES, byDepth, depthCue, project, rotateX, rotateY, toScreen } from "./projection";

const close = (a: number, b: number, tolerance = 1e-9) => Math.abs(a - b) < tolerance;

test("sin giro, la proyección es la identidad con la y invertida (SVG crece hacia abajo)", () => {
  const p = project([0.3, 0.5, -0.2], 0, 0);
  assert.ok(close(p.x, 0.3));
  assert.ok(close(p.y, -0.5));
  assert.ok(close(p.depth, -0.2));
});

test("rotateY de 90° lleva +x a -z", () => {
  const [x, y, z] = rotateY([1, 0, 0], Math.PI / 2);
  assert.ok(close(x, 0));
  assert.ok(close(y, 0));
  assert.ok(close(z, -1));
});

test("rotateX de 90° lleva +y a +z", () => {
  const [x, y, z] = rotateX([0, 1, 0], Math.PI / 2);
  assert.ok(close(x, 0));
  assert.ok(close(y, 0));
  assert.ok(close(z, 1));
});

test("las rotaciones conservan la norma", () => {
  const p = project([0.4, -0.7, 0.2], 1.3, -0.6);
  const norm = Math.hypot(p.x, p.y, p.depth);
  assert.ok(close(norm, Math.hypot(0.4, -0.7, 0.2)));
});

test("toScreen escala desde el centro", () => {
  const s = toScreen({ x: 1, y: -1, depth: 0 }, { cx: 360, cy: 232, scale: 175 });
  assert.equal(s.sx, 535);
  assert.equal(s.sy, 57);
});

test("depthCue está acotado y crece con la cercanía", () => {
  const far = depthCue(-2);
  const near = depthCue(2);
  assert.ok(far.r < near.r);
  assert.ok(far.opacity < near.opacity);
  assert.ok(far.opacity >= 0.5 && near.opacity <= 1);
});

test("byDepth pinta primero lo más lejano y no muta la entrada", () => {
  const items = [{ depth: 0.5 }, { depth: -1 }, { depth: 0 }];
  const sorted = byDepth(items);
  assert.deepEqual(
    sorted.map((item) => item.depth),
    [-1, 0, 0.5],
  );
  assert.equal(items[0].depth, 0.5);
});

test("el cubo tiene 12 aristas de longitud 2 entre vértices ±1", () => {
  assert.equal(CUBE_EDGES.length, 12);
  for (const [a, b] of CUBE_EDGES) {
    const length = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    assert.ok(close(length, 2));
    for (const value of [...a, ...b]) assert.ok(Math.abs(value) === 1);
  }
});
