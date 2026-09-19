"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, Network, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useEffect, useState } from "react";

import { StatusBadge } from "@/components/grifo/status-badge";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { CALENDAR, LATEST_MONTH } from "@/lib/features/portfolio/calendar";
import { formatScore } from "@/lib/features/portfolio/format";
import { fetchPortfolio, portfolioKeys } from "@/lib/features/portfolio/queries";
import type { PortfolioSearchState } from "@/lib/features/portfolio/search-params";

const ALL: Omit<PortfolioSearchState, "mes"> = {
  q: "",
  estado: "todos",
  accion: "todas",
  direccion: "todas",
  banda: "todas",
  prevision: "todas",
};

/**
 * Buscar una empresa o un grupo desde cualquier página y abrir su ficha encima
 * de la cartera. La lista se pide solo al abrir el diálogo: es la cartera
 * entera sin filtros, la misma consulta que ya tiene la tabla en caché.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [month] = useQueryState("mes", parseAsStringLiteral(CALENDAR).withDefault(LATEST_MONTH));
  const router = useRouter();
  const filters: PortfolioSearchState = { ...ALL, mes: month };

  const { data } = useQuery({
    queryKey: portfolioKeys.list(filters),
    queryFn: () => fetchPortfolio(filters),
    enabled: open,
    staleTime: 60 * 60 * 1000,
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = data
    ? [...new Map(data.rows.map((row) => [row.company.groupId, row.company.groupSize])).entries()]
        .filter(([, size]) => size > 1)
        .sort(([a], [b]) => a.localeCompare(b))
    : [];

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Buscar empresa o grupo"
        className="text-muted-foreground gap-2 font-normal sm:w-56 sm:justify-start"
      >
        <Search aria-hidden className="size-4" />
        <span className="flex-1 text-left max-sm:sr-only">Buscar empresa o grupo</span>
        <Kbd className="max-sm:hidden">⌘K</Kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Buscar"
        description="Empresa o grupo de la cartera"
      >
        <CommandInput placeholder="Empresa o grupo…" />
        <CommandList>
          <CommandEmpty>
            {data ? "Nada con ese nombre en la cartera." : "Cargando la cartera…"}
          </CommandEmpty>
          {data ? (
            <>
              <CommandGroup heading="Empresas">
                {data.rows.map((row) => (
                  <CommandItem
                    key={row.company.id}
                    value={`${row.company.id} ${row.company.groupId}`}
                    onSelect={() => go(`/cartera?mes=${month}&empresa=${row.company.id}`)}
                  >
                    <Building2 aria-hidden className="text-muted-foreground size-4" />
                    <span className="font-mono">{row.company.id}</span>
                    <span className="text-muted-foreground text-xs">{row.company.groupId}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <span className="text-xs tabular-nums">{formatScore(row.score)}</span>
                      <StatusBadge estado={row.estado} />
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {groups.length > 0 ? (
                <CommandGroup heading="Grupos">
                  {groups.map(([groupId, size]) => (
                    <CommandItem
                      key={groupId}
                      value={`grupo ${groupId}`}
                      onSelect={() => go(`/cartera?mes=${month}&grupo=${groupId}&pestana=decision`)}
                    >
                      <Network aria-hidden className="text-muted-foreground size-4" />
                      <span className="font-mono">{groupId}</span>
                      <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                        {size} empresas
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
