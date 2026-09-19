"use client";

import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { CompanyAvatar } from "@/components/grifo/company-avatar";
import { StatusBadge } from "@/components/grifo/status-badge";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/core/utils";
import { formatScore } from "@/lib/features/portfolio/format";
import { fetchPortfolio, portfolioKeys } from "@/lib/features/portfolio/queries";
import type { PortfolioSearchState } from "@/lib/features/portfolio/search-params";

/**
 * Elegir una empresa de la cartera por id o por grupo. Las ya elegidas se
 * marcan y no se pueden repetir; el título dice para qué se está eligiendo.
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
  const filters: PortfolioSearchState = {
    mes: month,
    q: "",
    estado: "todos",
    accion: "todas",
    direccion: "todas",
    banda: "todas",
  };
  const { data } = useQuery({
    queryKey: portfolioKeys.list(filters),
    queryFn: () => fetchPortfolio(filters),
    enabled: open,
    staleTime: 60 * 60 * 1000,
  });

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Busca por empresa o por grupo"
    >
      <CommandInput placeholder="Empresa o grupo…" />
      <CommandList>
        <CommandEmpty>
          {data ? "Nada con ese nombre en la cartera." : "Cargando la cartera…"}
        </CommandEmpty>
        {data ? (
          <CommandGroup heading={title}>
            {data.rows.map((row) => {
              const taken = chosen.includes(row.company.id);
              return (
                <CommandItem
                  key={row.company.id}
                  value={`${row.company.id} ${row.company.groupId}`}
                  disabled={taken}
                  onSelect={() => {
                    onPick(row.company.id);
                    onOpenChange(false);
                  }}
                >
                  <CompanyAvatar companyId={row.company.id} size="sm" className="shrink-0" />
                  <span className={cn("font-mono", taken && "text-muted-foreground")}>
                    {row.company.id}
                  </span>
                  {taken ? <Check aria-hidden className="size-4" /> : null}
                  <span className="text-muted-foreground text-xs">
                    {row.company.groupId}
                    {row.company.groupSize > 1 ? ` · ${row.company.groupSize} empresas` : ""}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="text-xs tabular-nums">{formatScore(row.score)}</span>
                    <StatusBadge estado={row.estado} />
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
