"use client";

import { cn } from "@/lib/core/utils";
import { formatEuros, formatMonthLong } from "@/lib/features/portfolio/format";
import type { Estado, PortfolioSummary } from "@/lib/features/portfolio/types";
import { ESTADO } from "@/lib/features/portfolio/vocabulary";

/** Peor primero, igual que la tabla: la barra y la lista cuentan la misma historia. */
const ORDER: Estado[] = ["riesgo", "vigilar", "sana", "sin_datos"];

const BAR = {
  riesgo: "bg-status-risk",
  vigilar: "bg-status-watch",
  sana: "bg-status-healthy",
  sin_datos: "bg-status-none",
} satisfies Record<Estado, string>;

const DOT = BAR;

export function PortfolioSummaryStrip({
  summary,
  month,
  activeEstado,
  onSelectEstado,
}: {
  summary: PortfolioSummary;
  month: string;
  activeEstado: Estado | "todos";
  onSelectEstado: (estado: Estado | "todos") => void;
}) {
  const total = summary.total || 1;

  return (
    <section
      aria-label="Resumen de la cartera"
      className="bg-card flex flex-col gap-5 rounded-lg border p-4 lg:flex-row lg:items-center lg:gap-8 lg:p-5"
    >
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-medium">
          {summary.total} {summary.total === 1 ? "empresa valorada" : "empresas valoradas"} en{" "}
          {formatMonthLong(month)}
        </h2>

        {/* Una sola distribución, no cuatro métricas sueltas: la proporción entre
            estados es justo lo que un analista mira primero. Sin filas que repartir
            no se reserva el carril: una barra vacía parece rota. */}
        {/* La barra es decorativa: los mismos números están en la lista de abajo,
            que además es interactiva. Marcarla `aria-hidden` evita que un lector
            de pantalla lea la distribución dos veces. */}
        <div
          aria-hidden
          hidden={summary.total === 0}
          className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full"
        >
          {ORDER.map((estado) => {
            const count = summary.byEstado[estado];
            if (count === 0) return null;
            return (
              <span
                key={estado}
                className={cn("h-full first:rounded-l-full last:rounded-r-full", BAR[estado])}
                style={{ width: `${(count / total) * 100}%` }}
              />
            );
          })}
        </div>

        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {ORDER.map((estado) => {
            const selected = activeEstado === estado;
            return (
              <li key={estado}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectEstado(selected ? "todos" : estado)}
                  title={ESTADO[estado].description}
                  className={cn(
                    "focus-visible:ring-ring -mx-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none",
                    selected ? "bg-secondary font-medium" : "hover:bg-secondary/60",
                  )}
                >
                  <span aria-hidden className={cn("size-1.5 rounded-full", DOT[estado])} />
                  <span className="text-muted-foreground">{ESTADO[estado].label}</span>
                  <span className="font-medium tabular-nums">{summary.byEstado[estado]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <dl className="flex gap-8 lg:gap-10 lg:border-l lg:pl-8">
        <div>
          <dt className="text-muted-foreground text-xs">Límite vivo</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">{formatEuros(summary.exposure)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Se mueven este mes</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">{summary.moved}</dd>
        </div>
      </dl>
    </section>
  );
}
