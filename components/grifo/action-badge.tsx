import { cn } from "@/lib/core/utils";
import type { Accion } from "@/lib/features/portfolio/types";
import { ACCION } from "@/lib/features/portfolio/vocabulary";

const TONE = {
  abrir: "bg-status-healthy-surface text-status-healthy-fg",
  ampliar: "bg-status-healthy-surface text-status-healthy-fg",
  mantener: "text-muted-foreground",
  reducir: "bg-status-watch-surface text-status-watch-fg",
  cerrar: "bg-status-risk-surface text-status-risk-fg",
} satisfies Record<Accion, string>;

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

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        quiet ? "text-muted-foreground" : TONE[action],
        className,
      )}
      title={ACCION[action].description}
    >
      {action === "cerrar" && !changed ? "Sin línea" : ACCION[action].label}
    </span>
  );
}
