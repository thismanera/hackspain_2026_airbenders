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
  const sense =
    meta.betterWhen === "alto"
      ? "Cuanto más alto el valor, mejor la nota"
      : "Cuanto más bajo el valor, mejor la nota";
  if (meta.healthy === undefined) return `${sense}.`;
  const bound = formatIndicatorValue(meta.healthy, meta.format);
  return meta.betterWhen === "alto"
    ? `${sense}. Sano a partir de ${bound}.`
    : `${sense}. Sano hasta ${bound}.`;
}

/**
 * El porqué del color, dicho con el dato de esta empresa delante: decir "cuanto
 * más bajo, mejor" en abstracto no basta, porque el lector tiene al lado una
 * Nota baja y da por hecho que "bajo" se refiere a ella. Aquí se nombra qué
 * hace mal o bien el Valor concreto, nunca la Nota.
 */
function verdict(meta: Indicator, raw: number, subscore: number): string {
  if (subscore >= 70) return "";
  const rating = subscore >= 45 ? "mejorable" : "mala";
  const wrongDirection = subscore >= 50 === (meta.betterWhen === "alto") ? "alto" : "bajo";
  const rawText = formatIndicatorValue(raw, meta.format);
  return ` Con ${rawText} el valor sale ${wrongDirection}, así que la nota es ${rating}.`;
}

export function IndicatorInfo({
  indicator,
  raw,
  subscore,
  missing = false,
}: {
  indicator: Indicator;
  raw?: number | null;
  subscore?: number;
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
          {raw !== undefined && raw !== null && subscore !== undefined
            ? verdict(indicator, raw, subscore)
            : null}
        </PopoverDescription>
        {missing ? (
          <p className="text-muted-foreground text-xs">Esta empresa no tiene el dato.</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
