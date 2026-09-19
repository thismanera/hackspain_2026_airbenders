/**
 * Geometría del espacio de pares: de un punto en el cubo [-1,1]³ a coordenadas
 * de pantalla. Ortográfica a propósito: con 44 puntos, la perspectiva añade un
 * parámetro y ninguna lectura. Funciones puras, sin DOM.
 */
import type { Vec3 } from "./types";

export type Projected = {
  x: number;
  /** Ya invertida para SVG (crece hacia abajo). */
  y: number;
  /** Positivo = más cerca de quien mira. */
  depth: number;
};

type View = { cx: number; cy: number; scale: number };

/** Giro alrededor del eje vertical (Y). */
export function rotateY([x, y, z]: Vec3, yaw: number): Vec3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [c * x + s * z, y, -s * x + c * z];
}

/** Inclinación alrededor del eje horizontal (X). */
export function rotateX([x, y, z]: Vec3, pitch: number): Vec3 {
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  return [x, c * y - s * z, s * y + c * z];
}

/** Rx(pitch) · Ry(yaw) · p, y se descarta la profundidad para pintar. */
export function project(p: Vec3, yaw: number, pitch: number): Projected {
  const [x, y, z] = rotateX(rotateY(p, yaw), pitch);
  return { x, y: -y, depth: z };
}

export function toScreen(p: Projected, view: View): { sx: number; sy: number } {
  return { sx: view.cx + p.x * view.scale, sy: view.cy + p.y * view.scale };
}

/** Lo cercano, más grande y más opaco. La profundidad del cubo va de -√3 a √3. */
export function depthCue(depth: number): { t: number; r: number; opacity: number } {
  const t = Math.min(1, Math.max(0, (depth + 1.2) / 2.4));
  return { t, r: 3 + 2.5 * t, opacity: 0.55 + 0.45 * t };
}

/** Orden del pintor: primero lo lejano. */
export function byDepth<T extends { depth: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.depth - b.depth);
}

const CORNERS: Vec3[] = [];
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) CORNERS.push([x, y, z]);

/** Las 12 aristas del cubo unidad: pares de vértices que difieren en una sola coordenada. */
export const CUBE_EDGES: readonly (readonly [Vec3, Vec3])[] = CORNERS.flatMap((a, i) =>
  CORNERS.slice(i + 1)
    .filter((b) => a.filter((value, axis) => value !== b[axis]).length === 1)
    .map((b) => [a, b] as const),
);

/** Extremos positivos de los tres ejes, un poco fuera del cubo para el rótulo. */
export const AXIS_TIPS: readonly Vec3[] = [
  [1.18, 0, 0],
  [0, 1.18, 0],
  [0, 0, 1.18],
];
