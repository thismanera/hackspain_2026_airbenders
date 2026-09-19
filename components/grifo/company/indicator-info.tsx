"use client";

import { Info } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatIndicatorValue } from "@/lib/features/portfolio/format";
import type { Indicator } from "@/lib/features/portfolio/indicators";

function reading(meta: Indicator): string {
  const sense = meta.betterWhen === "alto" ? "Cuanto más alto, mejor" : "Cuanto más bajo, mejor";
  if (meta.healthy === undefined) return `${sense}.`;
  const bound = formatIndicatorValue(meta.healthy, meta.format);
  return meta.betterWhen === "alto"
    ? `${sense}. Sano a partir de ${bound}.`
    : `${sense}. Sano hasta ${bound}.`;
}

export function IndicatorInfo({
  indicator,
  missing = false,
}: {
  indicator: Indicator;
  missing?: boolean;
}) {
  return (
    <Popover modal>
      <PopoverTrigger
        aria-label={`Qué es ${indicator.label}`}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-5 shrink-0 items-center justify-center rounded-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none"
      >
        <Info aria-hidden className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-56 gap-1.5 p-3">
        <PopoverTitle>{indicator.label}</PopoverTitle>
        <PopoverDescription className="text-pretty">
          {indicator.question} {reading(indicator)}
        </PopoverDescription>
        {missing ? (
          <p className="text-muted-foreground text-xs">Esta empresa no tiene el dato.</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
