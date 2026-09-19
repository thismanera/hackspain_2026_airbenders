"use client";

import { Check, Info, Lock, Send, ShieldCheck, Undo2 } from "lucide-react";
import { useState } from "react";

import { ActionBadge } from "@/components/grifo/action-badge";
import { Figure, Panel } from "@/components/grifo/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/core/utils";
import {
  formatApr,
  formatDays,
  formatEuros,
  formatMonthLong,
} from "@/lib/features/portfolio/format";
import { useOptIn } from "@/lib/features/portfolio/opt-in";
import type { CompanyFileResponse, TenorOption } from "@/lib/features/portfolio/types";
import { BANDA } from "@/lib/features/portfolio/vocabulary";

export function LoanSimulator({ file }: { file: CompanyFileResponse }) {
  const { latest, previous } = file;
  const { decision } = latest;
  const { requestedMonth, request, withdraw } = useOptIn(file.company.id);
  const requested = requestedMonth !== null;
  const changed = decision.action !== "mantener";

  const options = decision.menu;
  const [selectedTenorIndex, setSelectedTenorIndex] = useState(
    options.length > 0 ? options.length - 1 : 0,
  );

  const activeOption: TenorOption | undefined =
    options.length > 0 ? options[Math.min(selectedTenorIndex, options.length - 1)] : undefined;

  const limitChange =
    decision.previousLimit > 0 && decision.limit > 0
      ? Math.round((decision.limit / decision.previousLimit - 1) * 100)
      : null;

  if (!decision.eligible) {
    return (
      <Panel
        title="Tu oferta este mes"
        description="Sin circulante preaprobado este mes. Privado: nadie fuera de Embat lo sabe."
        aside={<ActionBadge action={decision.action} changed={changed} />}
      >
        <p className="max-w-[65ch] text-base leading-relaxed text-pretty">{decision.reason}</p>
        {previous?.decision.eligible ? (
          <p className="text-muted-foreground mt-4 border-t pt-3 text-xs text-pretty">
            El mes pasado tenías hasta {formatEuros(previous.decision.limit)} preaprobados. Cuando
            vuelvas a superar todas las puertas de elegibilidad, la oferta se rehabilitará
            automáticamente sin necesidad de solicitud previa.
          </p>
        ) : null}
      </Panel>
    );
  }

  return (
    <Panel
      title="Tu oferta este mes"
      description="Preaprobada y recalculada cada mes; nadie la ve fuera de Embat hasta que decidas pedirla."
      aside={<ActionBadge action={decision.action} changed={changed} />}
    >
      <p className="max-w-[65ch] text-sm leading-relaxed text-pretty font-medium text-foreground">
        {decision.reason}
      </p>

      {/* 4 Métricas de Condiciones */}
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure
          label="Hasta"
          value={formatEuros(decision.limit)}
          hint={
            limitChange !== null && limitChange !== 0 ? (
              <span
                className={cn(limitChange > 0 ? "text-status-healthy-fg" : "text-status-watch-fg")}
              >
                {limitChange > 0 ? "+" : ""}
                {limitChange} % desde {formatEuros(decision.previousLimit)}
              </span>
            ) : (
              "Igual que el mes pasado"
            )
          }
        />
        <Figure label="Banda" value={decision.band} hint={BANDA[decision.band].description} />
        <Figure
          label="Plazo máximo"
          value={formatDays(decision.maxTenorDays)}
          hint="Según banda y tendencia"
        />
        <Figure
          label="TAE desde"
          value={formatApr(decision.apr)}
          hint={`Base ${formatApr(decision.baseApr)} de banda ${decision.band}`}
        />
      </dl>

      {/* Simulador Interactivo de Disposición */}
      {options.length > 0 && activeOption ? (
        <div className="mt-5 rounded-xl border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Simulador de disposición por plazo</h3>
              <p className="text-muted-foreground text-xs">
                Selecciona la combinación óptima para tus necesidades de tesorería:
              </p>
            </div>
            <span className="text-muted-foreground text-xs tabular-nums">
              {options.length} combinaciones factibles
            </span>
          </div>

          {/* Selector de Plazos Segmentado */}
          <div className="mt-3 flex flex-wrap gap-2">
            {options.map((option, idx) => {
              const isSelected = idx === selectedTenorIndex;
              return (
                <button
                  key={option.days}
                  type="button"
                  onClick={() => setSelectedTenorIndex(idx)}
                  className={cn(
                    "flex flex-1 min-w-[5.5rem] flex-col items-center justify-center rounded-lg border px-3 py-2 text-center transition-all duration-150 focus-visible:ring-2 focus-visible:outline-none",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground shadow-xs"
                      : "border-border bg-card hover:bg-muted/60 text-foreground",
                  )}
                >
                  <span className="text-xs font-semibold tabular-nums">{option.days} días</span>
                  <span className={cn("text-xs tabular-nums", isSelected ? "text-primary-foreground/90 font-medium" : "text-muted-foreground")}>
                    {formatEuros(option.maxAmount)}
                  </span>
                  <span className={cn("text-xs tabular-nums mt-0.5", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {formatApr(option.apr)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Desglose de Costes */}
          <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4 text-xs">
            <div>
              <span className="text-muted-foreground block">Importe a disponer</span>
              <span className="text-base font-semibold tabular-nums text-foreground">
                {formatEuros(activeOption.maxAmount)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Coste en intereses</span>
              <span className="text-base font-semibold tabular-nums text-foreground">
                {formatEuros(activeOption.cost)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">TAE aplicada</span>
              <span className="text-base font-semibold tabular-nums text-foreground">
                {formatApr(activeOption.apr)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Coste mensual aprox.</span>
              <span className="text-base font-semibold tabular-nums text-status-healthy-fg">
                ~{formatEuros(Math.round(activeOption.cost / Math.max(1, activeOption.days / 30)))} / mes
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Bloque de Opt-in y Consentimiento */}
      <div className="mt-5 rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-status-healthy-fg" />
            <div>
              <p className="text-xs font-medium text-foreground">
                Garantía de privacidad Embat (Opt-in estricto)
              </p>
              <p className="text-muted-foreground text-xs text-pretty mt-0.5">
                {requested ? (
                  <span className="text-status-healthy-fg font-medium">
                    Oferta solicitada en {formatMonthLong(requestedMonth)}. El partner financiero ya ve tu
                    score y límite, pero sigue sin tener acceso a movimientos ni facturas.
                  </span>
                ) : (
                  "Hasta que no pulses 'Pedir circulante', nadie fuera de Embat conoce tu score ni esta oferta."
                )}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {requested ? (
              <Button variant="outline" size="sm" onClick={withdraw}>
                <Undo2 aria-hidden className="size-3.5" />
                Retirar solicitud
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={() => request(latest.month)}
              disabled={requested}
              className={cn(
                requested ? "bg-status-healthy text-primary-foreground" : "bg-primary text-primary-foreground",
              )}
            >
              {requested ? (
                <Check aria-hidden className="size-4" strokeWidth={2.5} />
              ) : (
                <Send aria-hidden className="size-4" />
              )}
              {requested ? "Solicitado con éxito" : "Pedir circulante"}
            </Button>
          </div>
        </div>

        {requested ? (
          <p className="text-muted-foreground mt-2 border-t pt-2 text-xs">
            Modo demo: La solicitud queda registrada en el navegador y la empresa pasará a estar visible en la cartera del partner.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
