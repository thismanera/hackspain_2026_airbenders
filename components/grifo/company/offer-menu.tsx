"use client";

import { useState } from "react";

import { Panel } from "@/components/grifo/panel";
import { cn } from "@/lib/core/utils";
import { formatApr, formatEuros } from "@/lib/features/portfolio/format";
import type { TenorOption } from "@/lib/features/portfolio/types";

/**
 * Región factible de SOURCE §2.4. La dependencia entre plazo y cantidad es el
 * corazón de la oferta —corto y poco, o largo, más y más caro— y se entiende
 * mucho mejor eligiendo que leyendo una fórmula.
 */
export function OfferMenu({ options }: { options: TenorOption[] }) {
  const [selected, setSelected] = useState(options.length - 1);

  if (options.length === 0) {
    return (
      <Panel title="Qué se puede ofrecer">
        <p className="text-muted-foreground text-sm text-pretty">
          Ninguna combinación de plazo e importe es viable este mes. No hay operación que proponer.
        </p>
      </Panel>
    );
  }

  const active = options[Math.min(selected, options.length - 1)];

  return (
    <Panel title="Qué se puede ofrecer" bodyClassName="p-0">
      {/* Radios nativos, no `role="radio"` sobre botones: así las flechas del
          teclado recorren las opciones sin que tengamos que reimplementarlo. */}
      <fieldset className="w-full min-w-0 divide-y">
        <legend className="sr-only">Combinaciones de plazo e importe</legend>
        {options.map((option, index) => {
          const isActive = option.days === active.days;
          return (
            <label
              key={option.days}
              className={cn(
                "has-[:focus-visible]:ring-ring flex w-full cursor-pointer items-baseline gap-3 px-4 py-2.5 text-left transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:-ring-offset-2",
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
        A {active.days} días puede disponer de{" "}
        <span className="text-foreground font-medium">{formatEuros(active.maxAmount)}</span> al{" "}
        {formatApr(active.apr)}, con un coste de intereses de{" "}
        <span className="text-foreground font-medium">{formatEuros(active.cost)}</span>.
      </p>
    </Panel>
  );
}
