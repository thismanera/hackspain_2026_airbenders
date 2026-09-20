"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePortfolioFilters } from "@/lib/features/portfolio/hooks";

/**
 * Exporta exactamente lo que hay en pantalla, filtros incluidos. Un botón que
 * bajase siempre la cartera entera sería una trampa: el analista cree que se
 * lleva su selección.
 */
export function ExportButton() {
  const [filters] = usePortfolioFilters();

  const params = new URLSearchParams({ month: filters.mes });
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.estado !== "todos") params.set("estado", filters.estado);
  if (filters.accion !== "todas") params.set("accion", filters.accion);
  if (filters.direccion !== "todas") params.set("direccion", filters.direccion);
  if (filters.banda !== "todas") params.set("banda", filters.banda);

  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={
        // El texto lo inyecta `Button` por composición, así que el ancla necesita
        // su propio nombre accesible: en móvil el rótulo va en `sr-only`.
        <a
          href={`/api/portfolio/export?${params.toString()}`}
          download
          aria-label="Exportar CSV"
        />
      }
    >
      <Download aria-hidden className="size-4" />
      <span className="max-sm:sr-only">Exportar CSV</span>
    </Button>
  );
}
