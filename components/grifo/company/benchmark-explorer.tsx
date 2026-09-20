"use client";

import { Panel } from "@/components/grifo/panel";
import { cn } from "@/lib/core/utils";
import { formatIndicatorValue, formatPercent } from "@/lib/features/portfolio/format";
import { indicator } from "@/lib/features/portfolio/indicators";
import type { BenchmarkResponse, BenchmarkRow } from "@/lib/features/portfolio/types";

function rankedRows(benchmark: BenchmarkResponse): BenchmarkRow[] {
  return [...benchmark.rows]
    .filter((row) => row.percentile !== null)
    .sort((a, b) => (a.percentile ?? 1) - (b.percentile ?? 1));
}

/** Percentil = fracción de la cohorte con peor nota, no un segundo raw. */
function peersWorseLabel(percentile: number): string {
  if (percentile <= 0) return "nadie peor";
  return `${formatPercent(percentile, 0)} peores`;
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
                <div
                  aria-hidden
                  className="bg-muted relative h-1.5 w-14 overflow-hidden rounded-full"
                >
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
