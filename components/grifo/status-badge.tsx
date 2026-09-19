import { cn } from "@/lib/core/utils";
import type { Estado } from "@/lib/features/portfolio/types";
import { ESTADO } from "@/lib/features/portfolio/vocabulary";

/**
 * El estado nunca viaja solo en el color: el texto siempre está presente y el
 * punto es un refuerzo, no el mensaje. En escala de grises y en deuteranopía la
 * fila se sigue leyendo igual.
 */
const TONE = {
  sana: {
    dot: "bg-status-healthy",
    surface: "bg-status-healthy-surface",
    text: "text-status-healthy-fg",
  },
  vigilar: {
    dot: "bg-status-watch",
    surface: "bg-status-watch-surface",
    text: "text-status-watch-fg",
  },
  riesgo: {
    dot: "bg-status-risk",
    surface: "bg-status-risk-surface",
    text: "text-status-risk-fg",
  },
  sin_datos: {
    dot: "bg-status-none",
    surface: "bg-status-none-surface",
    text: "text-status-none-fg",
  },
} satisfies Record<Estado, { dot: string; surface: string; text: string }>;

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
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
        tone.surface,
        tone.text,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", tone.dot, size === "lg" && "size-2")}
      />
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
