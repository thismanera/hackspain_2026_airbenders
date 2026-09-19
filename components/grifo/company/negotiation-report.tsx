"use client";

import { Check, Printer } from "lucide-react";

import { Panel } from "@/components/grifo/panel";
import { Button } from "@/components/ui/button";
import { BANK_ASSUMPTIONS, bankComparison } from "@/lib/features/portfolio/bank-comparison";
import {
  formatApr,
  formatDays,
  formatEuros,
  formatScore,
  formatSigned,
} from "@/lib/features/portfolio/format";
import type { CompanyFileResponse } from "@/lib/features/portfolio/types";

export function NegotiationReport({
  file,
  inset = false,
}: {
  file: CompanyFileResponse;
  inset?: boolean;
}) {
  const { latest } = file;
  const { decision } = latest;
  const comparison = bankComparison(decision);

  const body = (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-pretty">
        {decision.eligible
          ? `Línea de ${formatEuros(decision.limit)} al ${formatApr(decision.apr)}, hasta ${formatDays(decision.maxTenorDays)}. Score ${formatScore(latest.score)}, banda ${decision.band}.`
          : `Este mes no hay línea. Score ${formatScore(latest.score)}, banda ${decision.band}.`}
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        <li className="flex items-start gap-2">
          <Check aria-hidden className="text-status-healthy-fg mt-0.5 size-3.5 shrink-0" />
          <span>Recalculada cada mes con movimientos y facturas, no con cuentas anuales.</span>
        </li>
        <li className="flex items-start gap-2">
          <Check aria-hidden className="text-status-healthy-fg mt-0.5 size-3.5 shrink-0" />
          <span>Sin aval de socios en la oferta de Embat.</span>
        </li>
        <li className="flex items-start gap-2">
          <Check aria-hidden className="text-status-healthy-fg mt-0.5 size-3.5 shrink-0" />
          <span>Lleva estas condiciones a tu banco si quieres igualar precio o plazo.</span>
        </li>
      </ul>
      {comparison ? (
        <p className="text-muted-foreground border-t pt-3 text-xs text-pretty">
          Frente a una póliza bancaria al {formatApr(comparison.bankApr)} con{" "}
          {formatApr(BANK_ASSUMPTIONS.openingFee * 100)} de apertura ({BANK_ASSUMPTIONS.label}),
          sobre {formatEuros(comparison.volume)} dispuestos un año:{" "}
          {comparison.savings >= 0
            ? `ahorras ${formatEuros(comparison.savings)}`
            : `Embat sale ${formatEuros(-comparison.savings)} más cara`}{" "}
          ({formatSigned(comparison.aprGap, 1)} pts de TAE).
        </p>
      ) : null}
      <Button variant="outline" size="sm" className="w-fit" onClick={() => window.print()}>
        <Printer aria-hidden className="size-3.5" />
        Imprimir
      </Button>
    </div>
  );

  if (inset) return body;

  return (
    <Panel title="Para llevar al banco" description="Las condiciones de este mes, para negociar.">
      {body}
    </Panel>
  );
}
