"use client";

import { useState } from "react";

import { Panel } from "@/components/grifo/panel";
import { cn } from "@/lib/core/utils";
import { formatApr, formatEuros } from "@/lib/features/portfolio/format";
import type { TenorOption } from "@/lib/features/portfolio/types";

/**
 * La misma región factible que `OfferMenu`, pero para la vista de empresa: el
 * plazo se elige en una fila de fichas y las tres cifras que dependen de él se
 * leen de un vistazo. La tabla de cinco filas dice lo mismo, pero obliga a
 * comparar tres columnas para responder «¿cuánto me llevo y qué me cuesta?».
 */
export function OfferTenorPicker({
  options,
  className,
}: {
  options: TenorOption[];
  className?: string;
}) {
  const [days, setDays] = useState<number | null>(null);

  if (options.length === 0) {
    return (
      <p className={cn("text-muted-foreground text-sm text-pretty", className)}>
        Ninguna combinación de plazo e importe es viable este mes.
      </p>
    );
  }

  const active = options.find((option) => option.days === days) ?? options[options.length - 1]!;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-muted-foreground text-xs font-medium">Elige el plazo</legend>
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => {
            const isActive = option.days === active.days;
            return (
              <label
                key={option.days}
                className={cn(
                  "has-[:focus-visible]:ring-ring cursor-pointer rounded-full border px-3 py-1 text-xs font-medium tabular-nums transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2",
                  isActive
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "bg-card hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="tenor-picker"
                  className="sr-only"
                  checked={isActive}
                  onChange={() => setDays(option.days)}
                />
                {option.days} días
              </label>
            );
          })}
        </div>
      </fieldset>

      <p aria-live="polite" className="text-sm leading-relaxed text-pretty">
        Dispones de{" "}
        <span className="font-semibold tabular-nums">{formatEuros(active.maxAmount)}</span> al{" "}
        <span className="font-semibold tabular-nums">{formatApr(active.apr)}</span>
        {active.cost > 0 ? (
          <>
            {" "}
            · <span className="tabular-nums">{formatEuros(active.cost)}</span> de intereses
          </>
        ) : null}
        .
      </p>

      <p className="text-muted-foreground text-xs text-pretty">
        A plazos cortos el importe lo limita la caja, no la línea.
      </p>
    </div>
  );
}

/**
 * Región factible de SOURCE §2.4. La dependencia entre plazo y cantidad es el
 * corazón de la oferta —corto y poco, o largo, más y más caro— y se entiende
 * mucho mejor eligiendo que leyendo una fórmula.
 */
export function OfferMenu({
  options,
  inset = false,
}: {
  options: TenorOption[];
  /** Dentro de otro contenedor: sin tarjeta propia, porque no se anidan. */
  inset?: boolean;
}) {
  const [selected, setSelected] = useState(options.length > 0 ? options.length - 1 : 0);

  if (options.length === 0) {
    const empty = (
      <p className="text-muted-foreground px-4 py-3 text-sm text-pretty">
        Ninguna combinación de plazo e importe es viable este mes.
      </p>
    );
    return inset ? empty : <Panel title="Qué se puede ofrecer">{empty}</Panel>;
  }

  const active = options[Math.min(selected, options.length - 1)];

  const body = (
    <>
      <p className="text-muted-foreground px-4 pt-3 text-xs">
        A cada plazo, el importe es lo que la caja cubre. Puede ser menor que el límite de la línea.
      </p>
      <fieldset className="mt-1 w-full min-w-0 divide-y">
        <legend className="sr-only">Combinaciones de plazo e importe</legend>
        {options.map((option, index) => {
          const isActive = option.days === active.days;
          return (
            <label
              key={option.days}
              className={cn(
                "has-[:focus-visible]:ring-ring has-[:focus-visible]:-ring-offset-2 flex w-full cursor-pointer items-baseline gap-3 px-4 py-2.5 text-left transition-colors duration-150 has-[:focus-visible]:ring-2",
                isActive ? "bg-secondary" : "hover:bg-muted/50",
              )}
            >
              <input
                type="radio"
                name="tenor"
                className="sr-only"
                checked={isActive}
                onChange={() => setSelected(index)}
              />
              <span
                className={cn(
                  "w-14 shrink-0 text-sm tabular-nums",
                  isActive ? "font-medium" : "text-muted-foreground",
                )}
              >
                {option.days} d
              </span>
              <span className="flex-1 text-sm font-medium tabular-nums">
                {formatEuros(option.maxAmount)}
              </span>
              <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
                {formatApr(option.apr)}
              </span>
            </label>
          );
        })}
      </fieldset>

      <p
        aria-live="polite"
        className="text-muted-foreground border-t px-4 py-3 text-xs leading-relaxed text-pretty"
      >
        A {active.days} días puedes disponer de{" "}
        <span className="text-foreground font-medium">{formatEuros(active.maxAmount)}</span> al{" "}
        {formatApr(active.apr)}. Intereses:{" "}
        <span className="text-foreground font-medium">{formatEuros(active.cost)}</span>.
      </p>
    </>
  );

  if (inset) return body;
  return (
    <Panel title="Qué se puede ofrecer" bodyClassName="p-0">
      {body}
    </Panel>
  );
}
