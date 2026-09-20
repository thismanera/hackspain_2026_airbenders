"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { CompanyAvatar } from "@/components/grifo/company-avatar";
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/core/utils";
import { formatScore } from "@/lib/features/portfolio/format";
import { fetchPortfolio, portfolioKeys } from "@/lib/features/portfolio/queries";
import type { PortfolioSearchState } from "@/lib/features/portfolio/search-params";

/** Misma cota que la búsqueda global: filtrar en memoria y pintar pocas filas. */
const MAX_RESULTS = 40;

export const PORTFOLIO_PICKER_FILTERS: Omit<PortfolioSearchState, "mes"> = {
  q: "",
  estado: "todos",
  accion: "todas",
  direccion: "todas",
  banda: "todas",
  prevision: "todas",
};

/**
 * Buscar una empresa en la cartera y añadirla. La lista completa (~1.300) se
 * pide una vez y se cachea; aquí solo filtramos y pintamos las primeras 40.
 */
export function CompanyPicker({
  open,
  onOpenChange,
  month,
  title,
  chosen,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  title: string;
  chosen: string[];
  onPick: (companyId: string) => void;
}) {
  const [term, setTerm] = useState("");
  const filters: PortfolioSearchState = { ...PORTFOLIO_PICKER_FILTERS, mes: month };

  const { data } = useQuery({
    queryKey: portfolioKeys.list(filters),
    queryFn: () => fetchPortfolio(filters),
    enabled: open,
    staleTime: 60 * 60 * 1000,
  });

  const needle = term.trim().toUpperCase();
  const rows = data
    ? data.rows
        .filter(
          (row) =>
            !chosen.includes(row.company.id) &&
            (needle === "" ||
              row.company.id.includes(needle) ||
              row.company.groupId.includes(needle)),
        )
        .slice(0, MAX_RESULTS)
    : [];

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTerm("");
        onOpenChange(next);
      }}
      title={title}
    >
      <CommandInput
        placeholder="Empresa o grupo…"
        value={term}
        onValueChange={setTerm}
      />
      <CommandList>
        <CommandEmpty>
          {data ? "Nada con ese nombre." : "Cargando…"}
        </CommandEmpty>
        {rows.map((row) => (
          <CommandItem
            key={row.company.id}
            value={`${row.company.id} ${row.company.groupId}`}
            className="gap-3 py-2.5 [&>svg:last-child]:hidden"
            onSelect={() => {
              onPick(row.company.id);
              setTerm("");
              onOpenChange(false);
            }}
          >
            <CompanyAvatar companyId={row.company.id} size="sm" className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-sm leading-tight">{row.company.id}</span>
              <span className="text-muted-foreground block truncate text-xs leading-tight">
                {row.company.groupId}
                {row.company.groupSize > 1 ? ` · ${row.company.groupSize} empresas` : ""}
              </span>
            </span>
            <span
              className={cn(
                "shrink-0 text-sm font-medium tabular-nums",
                row.score >= 70 && "text-status-healthy-fg",
                row.score < 50 && "text-status-risk-fg",
              )}
            >
              {formatScore(row.score)}
            </span>
          </CommandItem>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
