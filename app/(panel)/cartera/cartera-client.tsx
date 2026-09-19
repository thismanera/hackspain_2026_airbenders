"use client";

import { SearchX } from "lucide-react";
import dynamic from "next/dynamic";

import { HotList } from "@/components/grifo/hot-list";
import { PortfolioFilters } from "@/components/grifo/portfolio-filters";
import { PortfolioKpis } from "@/components/grifo/portfolio-summary";
import { PortfolioTable } from "@/components/grifo/portfolio-table";
import { EntitySheet } from "@/components/grifo/sheet/entity-sheet";
import { TrajectoryMap } from "@/components/grifo/trajectory-map";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { usePortfolio, usePortfolioFilters, useSheetState } from "@/lib/features/portfolio/hooks";
import { formatMonthLong } from "@/lib/features/portfolio/format";

/** Recharts fuera del bundle inicial: la tabla y los KPI no lo necesitan para hidratar. */
const EstadoEvolution = dynamic(() =>
  import("@/components/grifo/portfolio-charts").then((m) => m.EstadoEvolution),
);
const AccionBreakdown = dynamic(() =>
  import("@/components/grifo/portfolio-charts").then((m) => m.AccionBreakdown),
);

const CLEARED = {
  q: "",
  estado: "todos",
  accion: "todas",
  direccion: "todas",
  banda: "todas",
  prevision: "todas",
} as const;

export function CarteraClient() {
  const [filters, setFilters] = usePortfolioFilters();
  const { data } = usePortfolio(filters);
  const [, setSheet] = useSheetState();

  const noneAtAll = data.totalUnfiltered === 0;
  const onChange = (update: Partial<typeof filters>) => void setFilters(update);
  const openCompany = (empresa: string) =>
    void setSheet({ empresa, grupo: "", pestana: "decision" });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Cartera</h1>
          <p className="text-muted-foreground text-sm">
            {data.summary.total === data.totalUnfiltered
              ? `${data.summary.total} ${data.summary.total === 1 ? "empresa valorada" : "empresas valoradas"}`
              : `${data.summary.total} de ${data.totalUnfiltered} empresas valoradas`}{" "}
            a cierre de {formatMonthLong(data.month)}.
          </p>
        </div>
      </div>

      <PortfolioKpis
        summary={data.summary}
        previous={data.previous}
        filters={filters}
        onChange={onChange}
      />

      {!noneAtAll && data.summary.total > 0 ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <TrajectoryMap
              rows={data.rows}
              months={data.months}
              onOpenCompany={openCompany}
              className="lg:col-span-2"
            />
            <HotList rows={data.hot} onOpenCompany={openCompany} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <EstadoEvolution history={data.history} filters={filters} onChange={onChange} />
            <AccionBreakdown summary={data.summary} filters={filters} onChange={onChange} />
          </div>
        </>
      ) : null}

      <PortfolioFilters
        filters={filters}
        onChange={onChange}
        onClear={() => void setFilters(CLEARED)}
        shown={data.rows.length}
        total={data.totalUnfiltered}
      />

      {data.rows.length === 0 ? (
        <Empty className="bg-card rounded-xl border">
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
          {!noneAtAll ? (
            <Button variant="outline" size="sm" onClick={() => void setFilters(CLEARED)}>
              Quitar filtros
            </Button>
          ) : null}
        </Empty>
      ) : (
        <PortfolioTable
          rows={data.rows}
          month={data.month}
          resetKey={JSON.stringify(filters)}
          onOpenCompany={openCompany}
          onOpenGroup={(grupo) => void setSheet({ empresa: "", grupo, pestana: "decision" })}
        />
      )}

      <EntitySheet month={data.month} />
    </div>
  );
}
