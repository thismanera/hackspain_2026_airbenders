import { ArrowDownRight, ArrowUpRight, Equal, Minus, Plus, X, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/core/utils";
import type { Accion } from "@/lib/features/portfolio/types";
import { ACCION } from "@/lib/features/portfolio/vocabulary";

const TONE = {
  abrir: { icon: Plus, className: "bg-status-healthy-surface text-status-healthy-fg" },
  ampliar: { icon: ArrowUpRight, className: "bg-status-healthy-surface text-status-healthy-fg" },
  mantener: { icon: Equal, className: "text-muted-foreground" },
  reducir: { icon: ArrowDownRight, className: "bg-status-watch-surface text-status-watch-fg" },
  cerrar: { icon: X, className: "bg-status-risk-surface text-status-risk-fg" },
} satisfies Record<Accion, { icon: LucideIcon; className: string }>;

export const ACTION_ICON = {
  abrir: TONE.abrir.icon,
  ampliar: TONE.ampliar.icon,
  mantener: TONE.mantener.icon,
  reducir: TONE.reducir.icon,
  cerrar: TONE.cerrar.icon,
} satisfies Record<Accion, LucideIcon>;

/**
 * La acción del mes. Si no ha cambiado nada (una empresa que lleva sin línea
 * desde siempre) se muestra apagada: la tinta fuerte se reserva para lo que es
 * noticia, que es justo lo que el analista está buscando en esta columna.
 */
export function ActionBadge({
  action,
  changed = true,
  className,
}: {
  action: Accion;
  changed?: boolean;
  className?: string;
}) {
  const quiet = !changed || action === "mantener";
  const Icon = action === "cerrar" && !changed ? Minus : TONE[action].icon;

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full py-0.5 pr-2 pl-1.5 text-xs font-medium whitespace-nowrap",
        quiet ? "text-muted-foreground" : TONE[action].className,
        className,
      )}
      title={ACCION[action].description}
    >
      <Icon aria-hidden className="size-3 shrink-0" strokeWidth={2.25} />
      {action === "cerrar" && !changed ? "Sin línea" : ACCION[action].label}
    </span>
  );
}
