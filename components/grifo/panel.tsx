import type { ReactNode } from "react";

import { cn } from "@/lib/core/utils";

/**
 * Sección de la ficha. Separación por borde de un pelo y un escalón de claridad,
 * nunca por sombra: la ficha es densa y una sombra por panel la convertiría en
 * un montón de cajas flotando.
 */
export function Panel({
  title,
  description,
  aside,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("bg-card rounded-lg border", className)}>
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{title}</h2>
          {description ? (
            <p className="text-muted-foreground mt-0.5 text-xs text-pretty">{description}</p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Par etiqueta/valor alineado en columna, con el número siempre tabular. */
export function Figure({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
      {hint ? <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p> : null}
    </div>
  );
}
