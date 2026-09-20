/**
 * Un solo sitio para el vocabulario del playbook de tesorería (RCA): si un
 * valor interno del motor se traduce a texto en dos pantallas, se traduce
 * igual en las dos.
 */
import { indicator } from "@/lib/features/portfolio/indicators";

import type { CanalRca, DiagnosticoRespuesta, ProductoSugerido } from "./types";

type Entry = { label: string; description: string };

export const DIAGNOSTICO = {
  reaccion_resiliente: {
    label: "Reacción resiliente",
    description: "Los cambios favorables observados compensan a los desfavorables.",
  },
  reaccion_destructiva: {
    label: "Reacción destructiva",
    description: "Las presiones observadas pesan más que las mejoras.",
  },
  reaccion_pasiva: {
    label: "Reacción pasiva",
    description: "No hay un saldo material favorable ni desfavorable.",
  },
  en_recuperacion: {
    label: "En recuperación",
    description: "La trayectoria muestra un rebote confirmado tras un suelo.",
  },
} satisfies Record<DiagnosticoRespuesta, Entry>;

export const CANAL = {
  operativo: "Operativo",
  financiero: "Financiero",
  comercial: "Comercial",
  holding: "Holding",
} satisfies Record<CanalRca, string>;

/** `null` = sin instrumento asociado; no se pinta chip de producto. */
export const PRODUCTO = {
  embat_factoring: "Factoring Embat",
  embat_confirming: "Confirming Embat",
  reestructuracion_deuda: "Reestructuración de deuda",
  cortafuegos_holding: "Cortafuegos de holding",
  gestion_cobros: "Gestión de cobros",
  ninguno: null,
} satisfies Record<ProductoSugerido, string | null>;

/**
 * El detonante de la inflexión (§1 del playbook) llega del motor como un
 * código técnico (`A3`, `holding`): igual que en el resto de la ficha, la
 * frase en llano va primero y el código queda como apoyo (ver
 * `portfolio/indicators.ts`).
 */
export function describeTrigger(trigger: {
  id: string;
  canal: string;
}): { label: string; support: string | null } {
  if (trigger.id === "holding") return { label: "la aportación del holding", support: null };
  const meta = indicator(trigger.id);
  if (!meta) return { label: "una variable no identificada", support: null };
  const canal = (CANAL as Record<string, string>)[trigger.canal] ?? trigger.canal;
  return { label: meta.label, support: `${meta.id} · ${canal.toLowerCase()}` };
}
