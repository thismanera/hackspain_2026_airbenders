"use client";

import { useQueryState } from "nuqs";
import { parseAsStringLiteral } from "nuqs";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CALENDAR, LATEST_MONTH } from "@/lib/features/portfolio/calendar";
import { formatMonthShort } from "@/lib/features/portfolio/format";

const monthParser = parseAsStringLiteral(CALENDAR).withDefault(LATEST_MONTH);

/**
 * El mes vive en la URL como todo lo demás, así que cambiarlo aquí cambia a la
 * vez la cartera, la ficha abierta y el enlace que puedas pegarle a alguien.
 */
export function MonthSelect() {
  const [month, setMonth] = useQueryState("mes", monthParser.withOptions({ shallow: false }));

  return (
    <Select value={month} onValueChange={(value) => void setMonth(value as string)}>
      <SelectTrigger size="sm" aria-label="Mes de la valoración" className="min-w-[8.5rem]">
        <SelectValue>{formatMonthShort(month)}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end" className="max-h-72">
        {[...CALENDAR].reverse().map((value) => (
          <SelectItem key={value} value={value}>
            {formatMonthShort(value)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
