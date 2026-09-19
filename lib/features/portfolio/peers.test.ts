import assert from "node:assert/strict";
import { test } from "node:test";

import { INDICATORS } from "./indicators";
import { PEER_LABELS, clusterLabel, kmeans, pcaFit, projectRow, standardize } from "./peers";

const DIMS = 14;

/** LCG pequeño: los blobs sintéticos tienen que ser los mismos en cada ejecución. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Tres nubes en 14 dimensiones: alta en A, alta en B, alta en C. */
function blobs(perBlob = 30) {
  const rand = lcg(7);
  const rows: number[][] = [];
  const labels: number[] = [];
  const centers = [
    [90, 90, 90, 90, 90, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [30, 30, 30, 30, 30, 90, 90, 90, 90, 30, 30, 30, 30, 30],
    [30, 30, 30, 30, 30, 30, 30, 30, 30, 90, 90, 90, 90, 90],
  ];
  centers.forEach((center, label) => {
    for (let i = 0; i < perBlob; i++) {
      rows.push(center.map((value) => value + (rand() - 0.5) * 12));
      labels.push(label);
    }
  });
  return { rows, labels };
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

test("standardize ignora los nulos y deja media 0 y desviación 1", () => {
  const rows: (number | null)[][] = [
    [10, null],
    [20, 4],
    [30, 6],
    [40, 8],
  ];
  const { z, mean, std } = standardize(rows);
  assert.equal(mean[0], 25);
  assert.equal(mean[1], 6);
  assert.ok(Math.abs(std[1] - 2) < 1e-9);
  const meanZ0 = z.reduce((sum, row) => sum + row[0], 0) / z.length;
  assert.ok(Math.abs(meanZ0) < 1e-9);
  assert.equal(z[0][1], 0, "el nulo cae en la media, que es 0 estandarizado");
});

test("una columna sin varianza no aporta nada ni produce NaN", () => {
  const { z } = standardize([
    [5, 1],
    [5, 2],
    [5, 3],
  ]);
  for (const row of z) {
    assert.equal(row[0], 0);
    assert.ok(Number.isFinite(row[1]));
  }
});

test("pcaFit devuelve componentes ortonormales con varianza explicada decreciente", () => {
  const { rows } = blobs();
  const fit = pcaFit(rows, 3);
  assert.equal(fit.components.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(dot(fit.components[i], fit.components[i]) - 1) < 1e-8, `‖v${i}‖ = 1`);
    for (let j = i + 1; j < 3; j++) {
      assert.ok(Math.abs(dot(fit.components[i], fit.components[j])) < 1e-8, `v${i} ⟂ v${j}`);
    }
  }
  assert.ok(fit.explained[0] >= fit.explained[1] && fit.explained[1] >= fit.explained[2]);
  const total = fit.explained.reduce((sum, value) => sum + value, 0);
  assert.ok(total > 0 && total <= 1 + 1e-9);
});

test("pcaFit separa los blobs y es determinista", () => {
  const { rows, labels } = blobs();
  const a = pcaFit(rows, 3);
  const b = pcaFit(rows, 3);
  assert.deepEqual(a.components, b.components);

  const coords = rows.map((row) => projectRow(a, row));
  for (const point of coords) {
    for (const value of point) assert.ok(value >= -1 - 1e-9 && value <= 1 + 1e-9);
  }
  // Las medias de cada blob en el plano PC1-PC2 están lejos entre sí.
  const centroid = (label: number) => {
    const members = coords.filter((_, index) => labels[index] === label);
    return [0, 1].map((axis) => members.reduce((sum, p) => sum + p[axis], 0) / members.length);
  };
  const [c0, c1, c2] = [0, 1, 2].map(centroid);
  const dist = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  assert.ok(dist(c0, c1) > 0.5 && dist(c1, c2) > 0.5 && dist(c0, c2) > 0.5);
});

test("el signo de PC1 apunta a 'más sano': la suma de cargas es positiva", () => {
  const { rows } = blobs();
  const fit = pcaFit(rows, 3);
  const sum = fit.components[0].reduce((acc, value) => acc + value, 0);
  assert.ok(sum > 0);
});

test("projectRow imputa los nulos con la media: todo nulo cae en el centro", () => {
  const { rows } = blobs();
  const fit = pcaFit(rows, 3);
  assert.deepEqual(projectRow(fit, new Array(DIMS).fill(null)), [0, 0, 0]);
  const partial: (number | null)[] = rows[0].map((value, index) => (index === 3 ? null : value));
  const p = projectRow(fit, partial);
  for (const value of p) assert.ok(Number.isFinite(value) && Math.abs(value) <= 1);
});

test("kmeans recupera los tres blobs y es determinista", () => {
  const { rows, labels } = blobs();
  const fit = pcaFit(rows, 3);
  const coords = rows.map((row) => [...projectRow(fit, row)]);
  const a = kmeans(coords, 3, 20260919);
  const b = kmeans(coords, 3, 20260919);
  assert.deepEqual(a.labels, b.labels);
  for (let label = 0; label < 3; label++) {
    const assigned = new Set(a.labels.filter((_, index) => labels[index] === label));
    assert.equal(assigned.size, 1, `blob ${label} cae entero en un cluster`);
  }
  assert.equal(new Set(a.labels).size, 3);
});

test("kmeans con centroides iniciales conserva el orden de los ids", () => {
  const { rows } = blobs();
  const fit = pcaFit(rows, 3);
  const coords = rows.map((row) => [...projectRow(fit, row)]);
  const first = kmeans(coords, 3, 1);
  const jittered = coords.map((p) => p.map((value) => value * 0.98 + 0.01));
  const second = kmeans(jittered, 3, 1, first.centroids);
  const same = second.labels.filter((label, index) => label === first.labels[index]).length;
  assert.ok(same / coords.length > 0.95);
});

test("las etiquetas cubren los 14 indicadores y clusterLabel las compone", () => {
  assert.deepEqual(Object.keys(PEER_LABELS).sort(), INDICATORS.map((meta) => meta.id).sort());
  const label = clusterLabel([
    { indicator: "A1", above: true },
    { indicator: "C3", above: false },
  ]);
  assert.equal(label, "Con colchón de caja · cobran tarde");
  assert.equal(clusterLabel([]), "Sin rasgo dominante");
});
