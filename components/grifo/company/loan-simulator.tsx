"use client";

import { ArrowDownRight, ArrowUpRight, Lock } from "lucide-react";
import { useState } from "react";

import { OfferTenorPicker } from "@/components/grifo/company/offer-menu";
import { RequestLineButton } from "@/components/grifo/company/request-line";
import { Figure } from "@/components/grifo/panel";
import { cn } from "@/lib/core/utils";
import { formatApr, formatEuros } from "@/lib/features/portfolio/format";
import { decisionNarrative } from "@/lib/features/portfolio/narrative";
import type { CompanyFileResponse } from "@/lib/features/portfolio/types";

/**
 * Delta numérico del límite frente al mes pasado. `null` cuando no hay línea
 * previa con la que compararse o el límite no se ha movido: un "sin cambio"
 * no dice nada junto a las otras cifras de la fila.
 */
function limitDelta(file: CompanyFileResponse): number | null {
  const { decision } = file.latest;
  if (decision.previousLimit === 0) return null;
  const delta = decision.limit - decision.previousLimit;
  return delta === 0 ? null : delta;
}

/**
 * La oferta del mes: el importe, cuánto se mueve y en qué plazos se puede usar.
 * Nada más. Va directo bajo el título de la página —es lo que la página existe
 * para mostrar—, sin caja ni titular propios que la dupliquen.
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
  const [days, setDays] = useState<number | null>(null);

  if (!decision.eligible) {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        <p className="flex items-start gap-2.5 text-sm leading-relaxed text-pretty">
          <Lock aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <span className="max-w-[65ch]">{decisionNarrative(file).headline}</span>
        </p>
        {previous?.decision.eligible ? (
          <p className="text-muted-foreground text-xs text-pretty">
            El mes pasado tenías {formatEuros(previous.decision.limit)}. Cuando pases las puertas,
            la oferta vuelve sola.
          </p>
        ) : null}
      </div>
    );
  }

  const delta = limitDelta(file);
  const options = decision.menu;
  const active =
    options.length > 0 ? (options.find((option) => option.days === days) ?? options.at(-1)!) : null;

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {/* El número de cabecera es lo disponible al plazo elegido, no el techo:
          es la cifra que responde a «¿cuánto puedo pedir?». El techo en sí no
          se repite en texto —ya es el número grande a 180 días—, solo su
          movimiento frente al mes pasado. */}
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-5xl leading-none font-semibold tracking-[-0.02em] tabular-nums">
          {formatEuros(active ? active.maxAmount : decision.limit)}
        </span>
        <span className="text-muted-foreground text-base">
          disponible{active ? ` a ${active.days} días` : ""}
        </span>
      </p>

      {/* El plazo va justo debajo del número que gobierna: es el control, no
          un detalle aparte al que se llega más abajo. */}
      {options.length > 0 ? (
        <OfferTenorPicker options={options} value={days} onChange={setDays} />
      ) : null}

      <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
        {delta !== null ? (
          <Figure
            label="Desde el mes pasado"
            value={
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  delta > 0 ? "text-status-healthy-fg" : "text-status-risk-fg",
                )}
              >
                {delta > 0 ? (
                  <ArrowUpRight aria-hidden className="size-4" strokeWidth={2.5} />
                ) : (
                  <ArrowDownRight aria-hidden className="size-4" strokeWidth={2.5} />
                )}
                {delta > 0 ? "+" : "−"}
                {formatEuros(Math.abs(delta))}
              </span>
            }
          />
        ) : null}

        {active ? (
          <>
            <Figure label="TAE" value={formatApr(active.apr)} />
            {active.cost > 0 ? <Figure label="Intereses" value={formatEuros(active.cost)} /> : null}
          </>
        ) : null}
      </div>

      {/* En pantalla ancha el acto vive en la barra lateral, siempre a la vista.
          Aquí solo aparece cuando esa barra está plegada en un cajón. */}
      <RequestLineButton file={file} className="lg:hidden" />
    </div>
  );
}
