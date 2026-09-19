"use client";

import { Flame } from "lucide-react";

import { Panel } from "@/components/grifo/panel";
import { cn } from "@/lib/core/utils";
import { formatIndicatorValue, formatPercent } from "@/lib/features/portfolio/format";
import { indicator, type Indicator } from "@/lib/features/portfolio/indicators";
import type { BenchmarkResponse, BenchmarkRow } from "@/lib/features/portfolio/types";

function rankedRows(benchmark: BenchmarkResponse): BenchmarkRow[] {
  return [...benchmark.rows]
    .filter((row) => row.percentile !== null)
    .sort((a, b) => (a.percentile ?? 1) - (b.percentile ?? 1));
}

/** Qué es el número de la izquierda: en C1/C2 un 100 % no es una nota alta. */
function leverDetail(meta: Indicator, row: BenchmarkRow): string {
  const yours = formatIndicatorValue(row.raw, meta.format);
  const mid = formatIndicatorValue(row.medianRaw, meta.format);
  if (meta.id === "C1") {
    return `${yours} en 3 o menos · mediana ${mid}`;
  }
  if (meta.id === "C2") {
    return `${yours} en 3 o menos · mediana ${mid}`;
  }
  return `${yours} · mediana ${mid}`;
}

/** Percentil = fracción de la cohorte con peor nota, no un segundo raw. */
function peersWorseLabel(percentile: number): string {
  if (percentile <= 0) return "nadie peor";
  return `${formatPercent(percentile, 0)} peores`;
}

/**
 * Las palancas frente a pares, con la misma densidad que «Hot este mes»:
 * rango, nombre, una cifra y una barra. El detalle de los doce indicadores
 * vive plegado debajo.
 */
export function PeerLevers({
  benchmark,
  className,
}: {
  benchmark: BenchmarkResponse;
  className?: string;
}) {
  const levers = rankedRows(benchmark)
    .filter((row) => (row.percentile ?? 1) < 0.5)
    .slice(0, 5);
  const rows = levers.length > 0 ? levers : rankedRows(benchmark).slice(0, 5);
  const showingGaps = levers.length > 0;

  return (
    <Panel
      title="Frente a pares"
      description={
        showingGaps
          ? "Peor nota primero. Concentración al 100 %: todos los cobros identificados salen de tres clientes o menos."
          : `Por encima de la mediana en todo. Cohorte de ${benchmark.cohort}.`
      }
      className={cn("flex flex-col", className)}
      bodyClassName="flex-1 p-0"
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground px-4 py-6 text-center text-sm">
          Aún no hay comparación de cohorte este mes.
        </p>
      ) : (
        <ol className="divide-y">
          {rows.map((row, index) => {
            const meta = indicator(row.indicator);
            if (!meta || row.percentile === null) return null;
            const weak = row.percentile < 0.5;
            return (
              <li key={row.indicator} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-muted-foreground w-4 shrink-0 text-right text-xs tabular-nums">
                  {index + 1}
                </span>
                {weak ? (
                  <Flame
                    aria-hidden
                    className="text-status-watch-fg size-3.5 shrink-0"
                    strokeWidth={2.25}
                  />
                ) : (
                  <span className="size-3.5 shrink-0" />
                )}
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-sm font-medium">{meta.label}</span>
                  <span className="text-muted-foreground truncate text-xs tabular-nums">
                    {leverDetail(meta, row)}
                  </span>
                </span>
                <span
                  title={`El ${formatPercent(row.percentile, 0)} de la cohorte tiene peor nota`}
                  className={cn(
                    "w-19 shrink-0 text-right text-xs font-medium",
                    weak ? "text-status-watch-fg" : "text-status-healthy-fg",
                    row.percentile > 0 && "tabular-nums",
                  )}
                >
                  {peersWorseLabel(row.percentile)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

export function BenchmarkExplorer({
  benchmark,
  inset = false,
}: {
  benchmark: BenchmarkResponse;
  inset?: boolean;
}) {
  const rows = rankedRows(benchmark);

  const body = (
    <>
      <div className="text-muted-foreground grid grid-cols-[1fr_auto] gap-x-4 border-b px-4 py-2 text-xs sm:grid-cols-[1.5fr_6rem_6.5rem_6.5rem]">
        <span>Indicador</span>
        <span className="text-right sm:text-left">Tú</span>
        <span className="max-sm:hidden">Mediana</span>
        <span className="text-right">Pares peores</span>
      </div>
      <ul className="divide-y">
        {rows.map((row) => {
          const meta = indicator(row.indicator);
          if (!meta || row.percentile === null) return null;
          const good = row.percentile >= 0.5;
          return (
            <li
              key={row.indicator}
              className="grid grid-cols-[1fr_auto] items-center gap-x-4 px-4 py-2.5 sm:grid-cols-[1.5fr_6rem_6.5rem_6.5rem]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{meta.label}</p>
                <p className="text-muted-foreground truncate text-xs">{meta.question}</p>
              </div>
              <span className="text-right text-sm font-medium tabular-nums sm:text-left">
                {formatIndicatorValue(row.raw, meta.format)}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums sm:text-sm">
                {formatIndicatorValue(row.medianRaw, meta.format)}
              </span>
              <div className="flex items-center justify-end gap-2">
                <div aria-hidden className="bg-muted relative h-1.5 w-14 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full",
                      good ? "bg-status-healthy" : "bg-status-watch",
                    )}
                    style={{ width: `${Math.max(4, row.percentile * 100)}%` }}
                  />
                </div>
                <span
                  title={`El ${formatPercent(row.percentile, 0)} de la cohorte tiene peor nota`}
                  className={cn(
                    "min-w-16 text-right text-xs",
                    good ? "text-status-healthy-fg" : "text-status-watch-fg",
                    row.percentile > 0 && "tabular-nums",
                  )}
                >
                  {peersWorseLabel(row.percentile)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );

  if (inset) {
    return <div className="-mx-4 -my-3">{body}</div>;
  }

  return (
    <Panel
      title="Frente a empresas parecidas"
      description={`Percentil entre ${benchmark.cohort} empresas de tu cohorte.`}
      bodyClassName="p-0"
    >
      {body}
    </Panel>
  );
}
