"use client";

import { SearchX } from "lucide-react";

import { PortfolioFilters } from "@/components/grifo/portfolio-filters";
import { PortfolioSummaryStrip } from "@/components/grifo/portfolio-summary";
import { PortfolioTable } from "@/components/grifo/portfolio-table";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { usePortfolio, usePortfolioFilters } from "@/lib/features/portfolio/hooks";
import { formatMonthLong } from "@/lib/features/portfolio/format";
import type { Estado } from "@/lib/features/portfolio/types";

const CLEARED = {
  q: "",
  estado: "todos",
  accion: "todas",
  direccion: "todas",
  banda: "todas",
} as const;

export function CarteraClient() {
  const [filters, setFilters] = usePortfolioFilters();
  const { data } = usePortfolio(filters);

  const noneAtAll = data.totalUnfiltered === 0;

  return (
    <div className="flex flex-col gap-4">
      <PortfolioSummaryStrip
        summary={data.summary}
        month={data.month}
        activeEstado={filters.estado}
        onSelectEstado={(estado: Estado | "todos") => void setFilters({ estado })}
      />

      <PortfolioFilters
        filters={filters}
        onChange={(update) => void setFilters(update)}
        onClear={() => void setFilters(CLEARED)}
        shown={data.rows.length}
        total={data.totalUnfiltered}
      />

      {data.rows.length === 0 ? (
        <Empty className="bg-card rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX aria-hidden />
            </EmptyMedia>
            <EmptyTitle>
              {noneAtAll ? "Todavía no hay valoraciones de este mes" : "Ninguna empresa encaja"}
            </EmptyTitle>
            <EmptyDescription>
              {noneAtAll
                ? `El motor aún no ha puntuado ${formatMonthLong(data.month)}. Prueba con un mes anterior.`
                : `Ninguna de las ${data.totalUnfiltered} empresas de la cartera cumple a la vez todos los filtros activos.`}
            </EmptyDescription>
          </EmptyHeader>
          {noneAtAll ? null : (
            <Button variant="outline" size="sm" onClick={() => void setFilters(CLEARED)}>
              Quitar filtros
            </Button>
          )}
        </Empty>
      ) : (
        <PortfolioTable rows={data.rows} month={data.month} />
      )}
    </div>
  );
}
