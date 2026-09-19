import { AlertTriangle, CircleSlash, Eye, ShieldCheck, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/core/utils";
import type { Estado } from "@/lib/features/portfolio/types";
import { ESTADO } from "@/lib/features/portfolio/vocabulary";

/**
 * El estado nunca viaja solo en el color: el texto siempre está presente y el
 * icono es un refuerzo con forma propia, no el mensaje. En escala de grises y
 * en deuteranopía la fila se sigue leyendo igual.
 */
const TONE = {
  sana: {
    icon: ShieldCheck,
    dot: "bg-status-healthy",
    surface: "bg-status-healthy-surface",
    text: "text-status-healthy-fg",
  },
  vigilar: {
    icon: Eye,
    dot: "bg-status-watch",
    surface: "bg-status-watch-surface",
    text: "text-status-watch-fg",
  },
  riesgo: {
    icon: AlertTriangle,
    dot: "bg-status-risk",
    surface: "bg-status-risk-surface",
    text: "text-status-risk-fg",
  },
  sin_datos: {
    icon: CircleSlash,
    dot: "bg-status-none",
    surface: "bg-status-none-surface",
    text: "text-status-none-fg",
  },
} satisfies Record<Estado, { icon: LucideIcon; dot: string; surface: string; text: string }>;

export const STATUS_ICON = {
  sana: TONE.sana.icon,
  vigilar: TONE.vigilar.icon,
  riesgo: TONE.riesgo.icon,
  sin_datos: TONE.sin_datos.icon,
} satisfies Record<Estado, LucideIcon>;

export function StatusBadge({
  estado,
  size = "sm",
  className,
}: {
  estado: Estado;
  size?: "sm" | "lg";
  className?: string;
}) {
  const tone = TONE[estado];
  const Icon = tone.icon;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full font-medium whitespace-nowrap",
        tone.surface,
        tone.text,
        size === "sm" ? "py-0.5 pr-2 pl-1.5 text-xs" : "py-1 pr-2.5 pl-2 text-sm",
        className,
      )}
    >
      <Icon aria-hidden className={cn("shrink-0", size === "sm" ? "size-3" : "size-3.5")} />
      {ESTADO[estado].label}
    </span>
  );
}

/** Solo el punto, para cuando la etiqueta ya está en la columna de al lado. */
export function StatusDot({ estado, className }: { estado: Estado; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", TONE[estado].dot, className)}
      aria-hidden
    />
  );
}

export function statusTextClass(estado: Estado): string {
  return TONE[estado].text;
}
