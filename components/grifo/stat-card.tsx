import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/core/utils";

/**
 * Cifra con su icono y una línea de contexto debajo. La versión sin barras ni
 * filtro de la tarjeta KPI de la cartera: para páginas donde el número se lee,
 * no se pulsa.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  hint,
  tone = "neutral",
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: "neutral" | "healthy" | "watch" | "risk";
  className?: string;
}) {
  return (
    <div className={cn("bg-card flex flex-col gap-3 rounded-xl border p-4", className)}>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            tone === "neutral" && "bg-secondary text-secondary-foreground",
            tone === "healthy" && "bg-status-healthy-surface text-status-healthy-fg",
            tone === "watch" && "bg-status-watch-surface text-status-watch-fg",
            tone === "risk" && "bg-status-risk-surface text-status-risk-fg",
          )}
        >
          <Icon className="size-4" strokeWidth={2} />
        </span>
        <span className="text-muted-foreground text-sm font-medium">{label}</span>
      </div>
      <p className="text-2xl leading-none font-semibold tracking-[-0.02em] tabular-nums">
        {value}
        {unit ? (
          <span className="text-muted-foreground ml-1 text-base font-normal">{unit}</span>
        ) : null}
      </p>
      {hint ? <p className="text-muted-foreground text-xs text-pretty">{hint}</p> : null}
    </div>
  );
}

/** Cabecera de página: qué es esto en una línea, y para quién. */
export function PageIntro({
  title,
  description,
  aside,
}: {
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">{title}</h1>
        {description ? (
          <p className="text-muted-foreground mt-0.5 text-sm text-pretty">{description}</p>
        ) : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}
