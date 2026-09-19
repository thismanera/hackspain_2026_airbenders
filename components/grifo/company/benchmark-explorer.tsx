"use client";

import { CheckCircle2, Flame, HelpCircle, TrendingUp, Users } from "lucide-react";
import { useState } from "react";

import { Panel } from "@/components/grifo/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/core/utils";
import { formatIndicatorValue } from "@/lib/features/portfolio/format";
import { BLOCKS, indicator, type BlockId } from "@/lib/features/portfolio/indicators";
import type { BenchmarkResponse, BenchmarkRow } from "@/lib/features/portfolio/types";

type PillarFilter = "todos" | BlockId;

export function BenchmarkExplorer({ benchmark }: { benchmark: BenchmarkResponse }) {
  const [selectedPillar, setSelectedPillar] = useState<PillarFilter>("todos");

  const validRows = benchmark.rows.filter((row) => row.percentile !== null);
  const filteredRows = selectedPillar === "todos"
    ? validRows
    : validRows.filter((row) => {
        const meta = indicator(row.indicator);
        return meta?.block === selectedPillar;
      });

  // Identificar fortalezas (percentil >= 60) y palancas de mejora (percentil < 40)
  const strengths = validRows.filter((row) => (row.percentile ?? 0) >= 0.6);
  const levers = validRows.filter((row) => (row.percentile ?? 0) < 0.4);

  return (
    <Panel
      title="Frente a empresas parecidas"
      description={`Percentil y comparación por indicador entre ${benchmark.cohort} empresas de tu cohorte.`}
      aside={
        <div className="flex items-center gap-1">
          <Button
            variant={selectedPillar === "todos" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSelectedPillar("todos")}
          >
            Todos ({validRows.length})
          </Button>
          {(Object.keys(BLOCKS) as BlockId[]).map((blockId) => (
            <Button
              key={blockId}
              variant={selectedPillar === blockId ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSelectedPillar(blockId)}
            >
              {BLOCKS[blockId].label.split(" ")[0]}
            </Button>
          ))}
        </div>
      }
      bodyClassName="p-0"
    >
      {/* Cabecera de la tabla */}
      <div className="text-muted-foreground grid grid-cols-[1fr_auto] gap-x-4 border-b bg-muted/20 px-4 py-2 text-xs sm:grid-cols-[1.5fr_6rem_6.5rem_7.5rem]">
        <span>Indicador operativo</span>
        <span className="text-right sm:text-left">Tu valor</span>
        <span className="max-sm:hidden">Mediana sector</span>
        <span className="text-right">Percentil cohorte</span>
      </div>

      <ul className="divide-y">
        {filteredRows.map((row) => {
          const meta = indicator(row.indicator);
          if (!meta || row.percentile === null) return null;
          const good = row.percentile >= 0.5;
          const isTopStrength = row.percentile >= 0.65;
          const isKeyLever = row.percentile < 0.35;

          return (
            <li
              key={row.indicator}
              className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:grid-cols-[1.5fr_6rem_6.5rem_7.5rem] hover:bg-muted/30 transition-colors"
            >
              {/* Etiqueta y pregunta de negocio */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{meta.label}</span>
                  {isTopStrength ? (
                    <span className="bg-status-healthy-surface text-status-healthy-fg rounded-full px-2 py-0.5 text-xs font-medium inline-flex items-center gap-1">
                      <CheckCircle2 className="size-3" /> Fortaleza
                    </span>
                  ) : null}
                  {isKeyLever ? (
                    <span className="bg-status-watch-surface text-status-watch-fg rounded-full px-2 py-0.5 text-xs font-medium inline-flex items-center gap-1">
                      <Flame className="size-3" /> Palanca
                    </span>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-xs truncate mt-0.5">{meta.question}</p>
              </div>

              {/* Tu valor */}
              <span className="text-right text-sm font-semibold tabular-nums sm:text-left text-foreground">
                <span className="text-muted-foreground mr-1 text-xs font-normal sm:hidden">Tú: </span>
                {formatIndicatorValue(row.raw, meta.format)}
              </span>

              {/* Mediana del sector */}
              <span className="text-muted-foreground text-xs tabular-nums sm:text-sm">
                <span className="sm:hidden font-normal text-muted-foreground mr-1">Mediana: </span>
                {formatIndicatorValue(row.medianRaw, meta.format)}
              </span>

              {/* Barra de percentil con etiqueta */}
              <div className="flex items-center justify-end gap-2.5">
                <div
                  aria-hidden
                  className="bg-muted relative h-2 w-16 sm:w-20 overflow-hidden rounded-full"
                >
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full transition-all duration-300",
                      good ? "bg-status-healthy" : "bg-status-watch",
                    )}
                    style={{ width: `${Math.max(4, row.percentile * 100)}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "w-8 text-right text-xs font-medium tabular-nums",
                    good ? "text-status-healthy-fg" : "text-status-watch-fg",
                  )}
                >
                  p{Math.round(row.percentile * 100)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Resumen de Hallazgos y Diagnóstico */}
      <div className="grid gap-3 border-t bg-muted/10 p-4 sm:grid-cols-2 text-xs text-pretty">
        <div className="flex items-start gap-2">
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-status-healthy-fg" />
          <div>
            <span className="font-semibold text-foreground">Tus mayores fortalezas:</span>
            <p className="text-muted-foreground mt-0.5">
              Destacas positivamente en {strengths.length}{" "}
              {strengths.length === 1 ? "indicador" : "indicadores"} (por encima del percentil 60 de la muestra), lo que respalda tu calificación crediticia en banda B.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <TrendingUp aria-hidden className="mt-0.5 size-4 shrink-0 text-status-watch-fg" />
          <div>
            <span className="font-semibold text-foreground">Palancas de optimización:</span>
            <p className="text-muted-foreground mt-0.5">
              Hay {levers.length}{" "}
              {levers.length === 1 ? "variable con margen" : "variables con margen"} de mejora frente a tus pares. Mejorar tu gestión de pagos y caja te acercará directamente a Banda A.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
