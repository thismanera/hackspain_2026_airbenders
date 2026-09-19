"use client";

import { Check, Lock, Send, ShieldCheck, TrendingDown, TrendingUp, Undo2 } from "lucide-react";

import { ActionBadge } from "@/components/grifo/action-badge";
import { OfferTenorPicker } from "@/components/grifo/company/offer-menu";
import { Panel } from "@/components/grifo/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/core/utils";
import { formatEuros, formatMonthLong, formatMonthShort } from "@/lib/features/portfolio/format";
import { decisionNarrative } from "@/lib/features/portfolio/narrative";
import { useOptIn } from "@/lib/features/portfolio/opt-in";
import type { CompanyFileResponse } from "@/lib/features/portfolio/types";

/**
 * Lo que cambió respecto al mes pasado, en una sola ficha. Sustituye a la tabla
 * de antes/ahora en la cabecera de la oferta: tres filas por dos columnas para
 * decir «has subido 99.000 €» es hacer que el lector calcule la resta.
 */
function LimitDelta({ file }: { file: CompanyFileResponse }) {
  const previous = file.previous?.decision ?? null;
  const previousMonth = file.previous?.month ?? null;
  if (!previous || !previousMonth) return null;

  const before = previous.eligible ? previous.limit : 0;
  const delta = file.latest.decision.limit - before;
  if (delta === 0) {
    return (
      <span className="text-muted-foreground shrink-0 text-xs">
        Igual que en {formatMonthShort(previousMonth)}
      </span>
    );
  }

  const up = delta > 0;
  const Icon = up ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums",
        up
          ? "bg-status-healthy-surface text-status-healthy-fg"
          : "bg-status-watch-surface text-status-watch-fg",
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {up ? "+" : "−"}
      {formatEuros(Math.abs(delta))}
      <span className="font-normal opacity-80">
        {before === 0 ? "· antes sin línea" : `vs. ${formatMonthShort(previousMonth)}`}
      </span>
    </span>
  );
}

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
        <p className="flex items-start gap-2.5 text-sm leading-relaxed text-pretty">
          <Lock aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <span className="max-w-[65ch]">{headline}</span>
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

  return (
    <Panel
      title="Tu oferta este mes"
      description="Recalculada cada mes."
      aside={<ActionBadge action={decision.action} changed={changed} />}
      className={className}
      bodyClassName="p-0"
    >
      {/* El acto, y nada más: cifra, cuánto ha cambiado y el botón. El porqué va
          debajo en una frase, y el detalle de plazos en su propio bloque. */}
      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <p className="flex items-baseline gap-2">
            <span className="text-[2rem] leading-none font-semibold tracking-[-0.02em] tabular-nums">
              {formatEuros(decision.limit)}
            </span>
            <span className="text-muted-foreground text-sm">preaprobados</span>
          </p>
          <LimitDelta file={file} />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex shrink-0 items-center gap-2">
            {requested ? (
              <>
                {/* Pedida ya no es un botón apagado: es un estado, y los estados
                    de este sistema se dicen con palabra además de con color. */}
                <span className="bg-status-healthy-surface text-status-healthy-fg inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium">
                  <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
                  Línea pedida
                </span>
                <Button variant="outline" size="lg" onClick={withdraw}>
                  <Undo2 aria-hidden className="size-3.5" />
                  Retirar petición
                </Button>
              </>
            ) : (
              <Button size="lg" onClick={() => request(latest.month)}>
                <Send aria-hidden className="size-4" />
                Pedir {formatEuros(decision.limit)}
              </Button>
            )}
          </div>
          <p
            aria-live="polite"
            className="text-muted-foreground flex max-w-[52ch] items-start gap-1.5 text-xs text-pretty"
          >
            <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0" />
            <span>
              {requested ? (
                <>
                  Pedida en {formatMonthLong(requestedMonth)}. El partner ve score y límite; no ve
                  movimientos ni facturas.
                </>
              ) : (
                <>Al pedir, el partner verá score y límite. No verá movimientos ni facturas.</>
              )}
            </span>
          </p>
        </div>

        <p className="text-muted-foreground max-w-[65ch] border-t pt-3 text-xs leading-relaxed text-pretty">
          {headline}
        </p>
      </div>

      {decision.menu.length > 0 ? (
        <div className="border-t px-4 py-4">
          <OfferTenorPicker options={decision.menu} />
        </div>
      ) : null}
    </Panel>
  );
}
