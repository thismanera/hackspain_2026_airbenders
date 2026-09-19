"use client";

import { Check, Send, Undo2 } from "lucide-react";

import { ActionBadge } from "@/components/grifo/action-badge";
import { ConditionsTable } from "@/components/grifo/company/sheet-panels";
import { OfferMenu } from "@/components/grifo/company/offer-menu";
import { Panel } from "@/components/grifo/panel";
import { Button } from "@/components/ui/button";
import { formatEuros, formatMonthLong } from "@/lib/features/portfolio/format";
import { decisionNarrative } from "@/lib/features/portfolio/narrative";
import { useOptIn } from "@/lib/features/portfolio/opt-in";
import type { CompanyFileResponse } from "@/lib/features/portfolio/types";

export function LoanSimulator({
  file,
  className,
}: {
  file: CompanyFileResponse;
  className?: string;
}) {
  const { latest, previous } = file;
  const { decision } = latest;
  const { requestedMonth, request, withdraw } = useOptIn(file.company.id);
  const requested = requestedMonth !== null;
  const changed = decision.action !== "mantener";
  const headline = decisionNarrative(file).headline;

  if (!decision.eligible) {
    return (
      <Panel
        title="Tu oferta este mes"
        description="Sin línea preaprobada. Nadie fuera de Embat lo sabe."
        aside={<ActionBadge action={decision.action} changed={changed} />}
        className={className}
      >
        <p className="max-w-[65ch] text-sm leading-relaxed text-pretty">{headline}</p>
        {previous?.decision.eligible ? (
          <p className="text-muted-foreground mt-3 border-t pt-3 text-xs text-pretty">
            El mes pasado tenías {formatEuros(previous.decision.limit)}. Cuando pases las puertas,
            la oferta vuelve sola.
          </p>
        ) : null}
      </Panel>
    );
  }

  return (
    <Panel
      title="Tu oferta este mes"
      description="Recalculada cada mes."
      aside={<ActionBadge action={decision.action} changed={changed} />}
      className={className}
      bodyClassName="p-0"
    >
      <p className="max-w-[65ch] px-4 pt-4 text-sm leading-relaxed font-medium text-pretty">
        {headline}
      </p>

      <div className="mt-4 border-t">
        <ConditionsTable file={file} />
      </div>

      {decision.menu.length > 0 ? (
        <div className="border-t">
          <OfferMenu inset options={decision.menu} />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground max-w-[52ch] text-xs text-pretty">
          {requested ? (
            <>
              Pedida en {formatMonthLong(requestedMonth)}. El partner ve score y límite; no ve
              movimientos ni facturas.
            </>
          ) : (
            <>Al pedir, el partner verá score y límite. No verá movimientos ni facturas.</>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {requested ? (
            <Button variant="outline" size="sm" onClick={withdraw}>
              <Undo2 aria-hidden className="size-3.5" />
              Retirar petición
            </Button>
          ) : null}
          <Button size="sm" onClick={() => request(latest.month)} disabled={requested}>
            {requested ? (
              <Check aria-hidden className="size-4" strokeWidth={2.5} />
            ) : (
              <Send aria-hidden className="size-4" />
            )}
            {requested ? "Línea pedida" : "Pedir circulante"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
