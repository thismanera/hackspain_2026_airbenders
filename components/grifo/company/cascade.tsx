"use client";

import { useState } from "react";

import { Panel } from "@/components/grifo/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/core/utils";
import {
  formatIndicatorValue,
  formatPercent,
  formatSigned,
} from "@/lib/features/portfolio/format";
import { BLOCKS, indicator, type BlockId } from "@/lib/features/portfolio/indicators";
import type { Contribution, MonthScore } from "@/lib/features/portfolio/types";

type Mode = "bloque" | "movimiento";

function thresholdLabel(id: string): string | null {
  const meta = indicator(id);
  if (!meta?.healthy) return null;
  const operator = meta.betterWhen === "alto" ? "≥" : "≤";
  return `sano ${operator} ${formatIndicatorValue(meta.healthy, meta.format)}`;
}

function Row({ contribution }: { contribution: Contribution }) {
  const meta = indicator(contribution.indicator);
  if (!meta) return null;

  const missing = contribution.raw === null;
  const threshold = thresholdLabel(contribution.indicator);
  const moved = Math.abs(contribution.delta) >= 0.05;

  return (
    <li className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_5.5rem_6rem_4.5rem_4rem]">
      <div className="min-w-0 sm:col-span-1">
        <p className={cn("truncate text-sm", missing && "text-muted-foreground")}>{meta.label}</p>
        <p className="text-muted-foreground truncate text-xs">
          <span className="font-mono">{meta.id}</span>
          {threshold ? <> · {threshold}</> : null}
          {missing ? <> · sin cobertura para esta empresa</> : null}
        </p>
      </div>

      <span
        className={cn(
          "text-right text-sm tabular-nums max-sm:col-start-2 max-sm:row-start-1",
          missing ? "text-muted-foreground" : "",
        )}
      >
        {formatIndicatorValue(contribution.raw, meta.format)}
      </span>

      {/* La nota va en número y en barra: la barra sirve para comparar de un
          vistazo, el número para poder citarlo. El color es el tercer refuerzo. */}
      <span className="flex items-center gap-2 max-sm:col-span-2">
        <span
          className={cn(
            "w-6 shrink-0 text-right text-xs tabular-nums",
            missing ? "text-muted-foreground" : "",
          )}
        >
          {missing ? "—" : Math.round(contribution.subscore)}
        </span>
        <span aria-hidden className="bg-muted flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
          <span
            className={cn(
              "h-full rounded-full",
              missing
                ? "bg-status-none"
                : contribution.subscore >= 70
                  ? "bg-status-healthy"
                  : contribution.subscore >= 45
                    ? "bg-status-watch"
                    : "bg-status-risk",
            )}
            style={{ width: `${Math.max(2, contribution.subscore)}%` }}
          />
        </span>
      </span>

      <span className="text-right text-sm font-medium tabular-nums max-sm:hidden">
        {contribution.contribution.toLocaleString("es-ES", { maximumFractionDigits: 1 })}
      </span>

      <span
        className={cn(
          "text-right text-xs tabular-nums max-sm:hidden",
          !moved
            ? "text-muted-foreground"
            : contribution.delta > 0
              ? "text-status-healthy-fg"
              : "text-status-risk-fg",
        )}
      >
        {moved ? formatSigned(contribution.delta) : "—"}
      </span>
    </li>
  );
}

export function Cascade({ month }: { month: MonthScore }) {
  const [mode, setMode] = useState<Mode>("bloque");

  const byMovement = [...month.contributions].sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta),
  );

  return (
    <Panel
      title="De dónde sale el score"
      description="Cada variable aporta puntos según su nota y su peso. La suma de la columna de puntos es el score en solitario."
      bodyClassName="p-0"
      aside={
        <fieldset className="flex min-w-0 gap-1">
          <legend className="sr-only">Ordenar la cascada</legend>
          <Button
            variant={mode === "bloque" ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={mode === "bloque"}
            onClick={() => setMode("bloque")}
          >
            Por bloque
          </Button>
          <Button
            variant={mode === "movimiento" ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={mode === "movimiento"}
            onClick={() => setMode("movimiento")}
          >
            Qué se ha movido
          </Button>
        </fieldset>
      }
    >
      <div className="text-muted-foreground grid grid-cols-[1fr_auto] gap-x-4 border-b px-4 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_5.5rem_6rem_4.5rem_4rem]">
        <span>Variable</span>
        <span className="text-right">Valor</span>
        <span className="max-sm:hidden">Nota</span>
        <span className="text-right max-sm:hidden">Puntos</span>
        <span className="text-right max-sm:hidden">Cambio</span>
      </div>

      {mode === "bloque" ? (
        (Object.keys(BLOCKS) as BlockId[]).map((blockId) => {
          const block = BLOCKS[blockId];
          const rows = month.contributions.filter(
            (entry) => indicator(entry.indicator)?.block === blockId,
          );
          return (
            <div key={blockId}>
              <div className="bg-muted/40 flex items-baseline justify-between gap-3 border-b px-4 py-1.5">
                <h3 className="text-xs font-medium">
                  {block.label}
                  <span className="text-muted-foreground ml-1.5 font-normal">
                    peso {formatPercent(block.weight, 0)}
                  </span>
                </h3>
                <span className="text-xs tabular-nums">
                  nota{" "}
                  <span className="font-medium">
                    {month.blocks[blockId].toLocaleString("es-ES", { maximumFractionDigits: 0 })}
                  </span>
                </span>
              </div>
              <ul className="divide-y">
                {rows.map((entry) => (
                  <Row key={entry.indicator} contribution={entry} />
                ))}
              </ul>
            </div>
          );
        })
      ) : (
        <ul className="divide-y">
          {byMovement.map((entry) => (
            <Row key={entry.indicator} contribution={entry} />
          ))}
        </ul>
      )}

      <div className="flex items-baseline justify-between gap-3 border-t px-4 py-2.5 text-sm">
        <span className="font-medium">Score en solitario</span>
        <span className="font-semibold tabular-nums">
          {month.standaloneScore.toLocaleString("es-ES", { maximumFractionDigits: 1 })}
        </span>
      </div>
    </Panel>
  );
}
