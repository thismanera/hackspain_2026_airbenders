"use client";

import { Check, Printer } from "lucide-react";

import { Figure, Panel } from "@/components/grifo/panel";
import { Button } from "@/components/ui/button";
import { BANK_ASSUMPTIONS, bankComparison } from "@/lib/features/portfolio/bank-comparison";
import { formatApr, formatDays, formatEuros, formatSigned } from "@/lib/features/portfolio/format";
import type { CompanyFileResponse } from "@/lib/features/portfolio/types";

/**
 * Las condiciones del mes en cifras, para llevar al banco. Antes era un párrafo
 * con las mismas tres cifras dentro de una frase; en tarjeta se leen de un
 * vistazo como lo que son, tres datos, no una explicación.
 */
export function NegotiationReport({ file }: { file: CompanyFileResponse }) {
  const { latest } = file;
  const { decision } = latest;
  const comparison = bankComparison(decision);

  return (
    <Panel title="Para llevar al banco">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Figure label="Línea" value={formatEuros(decision.limit)} />
          <Figure label="TAE" value={formatApr(decision.apr)} />
          <Figure label="Plazo máximo" value={formatDays(decision.maxTenorDays)} />
        </div>

        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          <li className="flex items-center gap-1.5">
            <Check aria-hidden className="text-status-healthy-fg size-3.5 shrink-0" />
            Sin aval de socios
          </li>
          <li className="flex items-center gap-1.5">
            <Check aria-hidden className="text-status-healthy-fg size-3.5 shrink-0" />
            Recalculada cada mes
          </li>
        </ul>

        {comparison ? (
          <div className="border-t pt-3">
            <Figure
              label={`Ahorro vs. banco al ${formatApr(comparison.bankApr)} (${BANK_ASSUMPTIONS.label})`}
              value={
                comparison.savings >= 0
                  ? formatEuros(comparison.savings)
                  : `−${formatEuros(-comparison.savings)}`
              }
              hint={`${formatSigned(comparison.aprGap, 1)} pts de TAE sobre ${formatEuros(comparison.volume)} un año`}
            />
          </div>
        ) : null}

        <Button variant="outline" size="sm" className="w-fit" onClick={() => window.print()}>
          <Printer aria-hidden className="size-3.5" />
          Imprimir
        </Button>
      </div>
    </Panel>
  );
}
