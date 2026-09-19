import { ChevronDown } from "lucide-react";
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
    <section className={cn("bg-card rounded-xl border", className)}>
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

/**
 * La evidencia de segundo orden de una ficha, en un solo contenedor. Cinco
 * paneles iguales apilados no tienen jerarquía: el analista no sabe cuál leer
 * primero. Aquí cada apartado se abre cuando hace falta.
 */
export function DetailStack({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={label} className={cn("bg-card divide-y rounded-xl border", className)}>
      {children}
    </section>
  );
}

export function DetailRow({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary className="hover:bg-status-none-surface focus-visible:ring-ring flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 font-medium">{title}</span>
        {aside ? <span className="text-muted-foreground ml-auto text-xs">{aside}</span> : null}
        <ChevronDown
          aria-hidden
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform duration-150 group-open:rotate-180",
            aside ? "" : "ml-auto",
          )}
        />
      </summary>
      <div className="border-t px-4 py-3">{children}</div>
    </details>
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
