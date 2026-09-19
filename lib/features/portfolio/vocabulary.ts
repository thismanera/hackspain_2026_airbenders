/**
 * Un solo sitio para el vocabulario del producto. Si "Vigilar" se escribe en dos
 * pantallas, se escribe igual en las dos: el glosario vive aquí y nadie inventa
 * sinónimos por variedad.
 */
import type { Accion, Banda, Direccion, Estado, Naturaleza } from "./types";

type Entry = {
  label: string;
  /** Qué significa, en una frase que se pueda leer sin haber leído SOURCE.md. */
  description: string;
};

export const ESTADO = {
  riesgo: {
    label: "Riesgo",
    description: "Score por debajo de 45, o dos meses seguidos sin pagar una obligación esperada.",
    order: 0,
  },
  vigilar: {
    label: "Vigilar",
    description: "Score entre 45 y 70. Se presta, con menos importe y menos plazo.",
    order: 1,
  },
  sana: {
    label: "Sana",
    description: "Score de 70 o más con confianza suficiente para opinar.",
    order: 2,
  },
  sin_datos: {
    label: "Sin datos",
    description: "Menos del 30 % de confianza. No hay historia suficiente para opinar.",
    order: 3,
  },
} satisfies Record<Estado, Entry & { order: number }>;

export const ACCION = {
  abrir: { label: "Abrir", description: "No tenía límite y ahora pasa todas las puertas." },
  ampliar: { label: "Ampliar", description: "El límite sube más de un 15 % y no hay deterioro." },
  mantener: { label: "Mantener", description: "El límite se queda como estaba." },
  reducir: {
    label: "Reducir",
    description: "El límite baja más de un 15 % dos meses seguidos, o hay deterioro estructural.",
  },
  cerrar: { label: "Cerrar", description: "Falla una puerta de elegibilidad. No se presta más." },
} satisfies Record<Accion, Entry>;

export const DIRECCION = {
  mejora: { label: "Mejora", description: "El score sube 6 puntos o más respecto a hace 3 meses." },
  estable: { label: "Estable", description: "El score se mueve menos de 6 puntos en 3 meses." },
  deterioro: { label: "Deterioro", description: "El score baja 6 puntos o más respecto a hace 3 meses." },
} satisfies Record<Direccion, Entry>;

export const NATURALEZA = {
  estructural: {
    label: "Estructural",
    description:
      "Dos meses en la misma dirección, con dos o más variables moviéndose igual y alguna de nivel de caja entre ellas.",
  },
  temporal: { label: "Temporal", description: "El movimiento no persiste ni arrastra a las variables de caja." },
  sin_cambio: { label: "Sin cambio", description: "El score no se ha movido de forma apreciable." },
} satisfies Record<Naturaleza, Entry>;

export const BANDA = {
  A: { label: "A", description: "Score 75 o más.", factor: 1, baseApr: 5, maxTenor: 180 },
  B: { label: "B", description: "Score entre 60 y 75.", factor: 0.7, baseApr: 7, maxTenor: 120 },
  C: { label: "C", description: "Score entre 45 y 60.", factor: 0.4, baseApr: 10, maxTenor: 60 },
  D: { label: "D", description: "Score por debajo de 45. No se presta.", factor: 0, baseApr: 0, maxTenor: 0 },
} satisfies Record<Banda, Entry & { factor: number; baseApr: number; maxTenor: number }>;

/**
 * Estado a partir del score, la confianza y la racha de impago (SOURCE §1.5).
 * El orden de las comprobaciones importa: sin confianza no se opina, y una racha
 * de dos meses manda por encima del score.
 */
export function deriveEstado(score: number, confidence: number, delayStreak: number): Estado {
  if (confidence < 0.3) return "sin_datos";
  if (score < 45 || delayStreak >= 2) return "riesgo";
  if (score < 70) return "vigilar";
  return confidence >= 0.5 ? "sana" : "vigilar";
}

export function deriveBanda(score: number): Banda {
  if (score >= 75) return "A";
  if (score >= 60) return "B";
  if (score >= 45) return "C";
  return "D";
}

export function deriveDireccion(trend3m: number | null): Direccion {
  if (trend3m === null) return "estable";
  if (trend3m >= 6) return "mejora";
  if (trend3m <= -6) return "deterioro";
  return "estable";
}
