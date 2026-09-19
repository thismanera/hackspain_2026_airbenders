"use client";

import { Lock } from "lucide-react";

import { ActionBadge } from "@/components/grifo/action-badge";
import { OfferTenorPicker } from "@/components/grifo/company/offer-menu";
import { RequestLineButton } from "@/components/grifo/company/request-line";
import { Panel } from "@/components/grifo/panel";
import { formatEuros, formatMonthShort } from "@/lib/features/portfolio/format";
import { decisionNarrative } from "@/lib/features/portfolio/narrative";
import type { CompanyFileResponse } from "@/lib/features/portfolio/types";

/**
 * Cuánto ha cambiado el límite, en las palabras del motor. La referencia es
 * `decision.previousLimit` —lo que el motor registró el mes pasado— y no la
 * decisión del snapshot anterior: cuando una empresa deja de ser elegible un mes
 * las dos cifras no coinciden, y con dos fuentes la tarjeta se contradecía a sí
 * misma («+137.000 €, antes sin línea» encima de «110.000 € → 137.000 €»).
 */
function limitChange(file: CompanyFileResponse): string | null {
  const { decision } = file.latest;
  const previousMonth = file.previous?.month ?? null;
  const delta = decision.limit - decision.previousLimit;
  const since = previousMonth ? ` desde ${formatMonthShort(previousMonth)}` : "";

  if (decision.previousLimit === 0) return previousMonth ? `nuevos${since}` : null;
  if (delta === 0) return `sin cambio${since}`;
  return `${delta > 0 ? "+" : "−"}${formatEuros(Math.abs(delta))}${since}`;
}

/**
 * La oferta del mes: el importe, cuánto se mueve y en qué plazos se puede usar.
 * Nada más. El titular redactado repetía las mismas cifras que ya están en
 * pantalla y la tabla de antes/ahora vive plegada debajo, donde se consulta si
 * hace falta en vez de leerse siempre.
 */
export function LoanSimulator({
  file,
  className,
}: {
  file: CompanyFileResponse;
  className?: string;
}) {
  const { latest, previous } = file;
  const { decision } = latest;
  const changed = decision.action !== "mantener";

  if (!decision.eligible) {
    return (
      <Panel
        title="Tu oferta este mes"
        description="Sin línea este mes. El partner no recibe nada hasta que la pidas."
        aside={<ActionBadge action={decision.action} changed={changed} />}
        className={className}
      >
        <p className="flex items-start gap-2.5 text-sm leading-relaxed text-pretty">
          <Lock aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <span className="max-w-[65ch]">{decisionNarrative(file).headline}</span>
        </p>
        {previous?.decision.eligible ? (
          <p className="text-muted-foreground mt-3 border-t pt-3 text-xs text-pretty">
            El mes pasado tenías {formatEuros(previous.decision.limit)}. Cuando pases las puertas,
            la oferta vuelve sola.
          </p>
        ) : null}
      </Panel>
    );
  }

  const change = limitChange(file);

  return (
    <Panel
      title="Tu oferta este mes"
      description="Recalculada cada mes con el score; el partner solo la recibe si la pides."
      aside={<ActionBadge action={decision.action} changed={changed} />}
      className={className}
      bodyClassName="p-0"
    >
      <div className="px-4 py-4">
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-3xl leading-none font-semibold tracking-[-0.02em] tabular-nums">
            {formatEuros(decision.limit)}
          </span>
          <span className="text-muted-foreground text-sm">
            preaprobados{change ? ` · ${change}` : ""}
          </span>
        </p>
      </div>

      {decision.menu.length > 0 ? (
        <div className="border-t px-4 py-4">
          <OfferTenorPicker options={decision.menu} />
        </div>
      ) : null}

      {/* En pantalla ancha el acto vive en la barra lateral, siempre a la vista.
          Aquí solo aparece cuando esa barra está plegada en un cajón. */}
      <div className="border-t px-4 py-3 lg:hidden">
        <RequestLineButton file={file} className="w-full" />
      </div>
    </Panel>
  );
}
