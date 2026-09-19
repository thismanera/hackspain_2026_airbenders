"use client";

import { Flame } from "lucide-react";

import { Panel } from "@/components/grifo/panel";
import { Sparkline, TrendDelta } from "@/components/grifo/trend";
import { cn } from "@/lib/core/utils";
import { formatSigned } from "@/lib/features/portfolio/format";
import type { PortfolioRow } from "@/lib/features/portfolio/types";

const FLAME_TONE = {
  mejora: "text-status-healthy-fg",
  estable: "text-muted-foreground",
  deterioro: "text-status-risk-fg",
} as const;

/** El icono que marca una empresa "hot" en la tabla y el mapa: siempre el mismo. */
export function HotFlame({
  direction,
  className,
}: {
  direction: PortfolioRow["direction"];
  className?: string;
}) {
  return (
    <Flame
      aria-label="Entre las que más se mueven este mes"
      className={cn("size-3.5 shrink-0", FLAME_TONE[direction], className)}
      strokeWidth={2.25}
    />
  );
}

/**
 * Las que más se han movido de verdad este mes. La lista dice quiénes; el mapa
 * de al lado dice dónde están y hacia dónde van. Solo entran cambios
 * estructurales a 3 meses, para no pintar fuego sobre un bache.
 */
export function HotList({
  rows,
  onOpenCompany,
  className,
}: {
  rows: PortfolioRow[];
  onOpenCompany: (companyId: string) => void;
  className?: string;
}) {
  return (
    <Panel
      title="Hot este mes"
      description="Cambio estructural a 3 meses, las que más se mueven primero."
      className={cn("flex flex-col", className)}
      bodyClassName="flex-1 p-0"
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground px-4 py-6 text-center text-sm">
          Nadie se mueve de forma estructural este mes.
        </p>
      ) : (
        <ol className="divide-y">
          {rows.map((row) => (
            <li key={row.company.id}>
              <button
                type="button"
                onClick={() => onOpenCompany(row.company.id)}
                className="hover:bg-muted/40 focus-visible:ring-ring flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
              >
                <HotFlame direction={row.direction} className="size-4" />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{row.company.id}</span>
                    <TrendDelta trend3m={row.trend3m} direction={row.direction} />
                  </span>
                  <span className="text-muted-foreground truncate text-xs tabular-nums">
                    {row.hot?.driver
                      ? `${row.hot.driver} ${formatSigned(row.hot.driverDelta)}`
                      : "Varias variables a la vez"}
                    {row.hot?.hasCritical ? " · alerta crítica" : ""}
                  </span>
                </span>
                <Sparkline values={row.spark} direction={row.direction} className="shrink-0" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
