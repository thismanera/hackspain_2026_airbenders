"use client";

import { Check, HandCoins, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/core/utils";
import { formatEuros, formatMonthLong } from "@/lib/features/portfolio/format";
import { useOptIn } from "@/lib/features/portfolio/opt-in";
import type { CompanyFileResponse } from "@/lib/features/portfolio/types";

/**
 * El acto de la vista de empresa: pedir la línea. Vive en un componente propio
 * porque se pinta en dos sitios que nunca coinciden en pantalla —la barra
 * lateral en escritorio, el panel de oferta cuando esa barra está plegada— y el
 * estado de opt-in tiene que ser el mismo en los dos.
 */
export function RequestLineButton({
  file,
  label,
  className,
}: {
  file: CompanyFileResponse;
  /** En la barra lateral manda el nombre del producto; en la oferta, el importe. */
  label?: string;
  className?: string;
}) {
  const { latest } = file;
  const { requestedMonth, request, withdraw } = useOptIn(file.company.id);

  if (!latest.decision.eligible) return null;

  if (requestedMonth !== null) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <span className="bg-status-healthy-surface text-status-healthy-fg inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium">
          <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
          Línea pedida en {formatMonthLong(requestedMonth)}
        </span>
        <Button variant="outline" size="sm" className="w-full" onClick={withdraw}>
          <Undo2 aria-hidden className="size-3.5" />
          Retirar petición
        </Button>
      </div>
    );
  }

  return (
    <Button size="lg" className={cn("w-full", className)} onClick={() => request(latest.month)}>
      <HandCoins aria-hidden className="size-4" />
      {label ?? `Pedir ${formatEuros(latest.decision.limit)}`}
    </Button>
  );
}
