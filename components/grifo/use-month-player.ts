"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useEffect, useState, useTransition } from "react";

import { CALENDAR, LATEST_MONTH } from "@/lib/features/portfolio/calendar";

const monthParser = parseAsStringLiteral(CALENDAR).withDefault(LATEST_MONTH);
const PLAY_INTERVAL_MS = 1100;

/**
 * "Ver el año": avanza el mes global de la URL cada segundo largo. Escribe el
 * mismo `mes` que `MonthSelect`, con `shallow: false`, así que toda la página
 * se vuelve a servir con el cierre nuevo. Al llegar al último mes se para; si
 * ya estaba en el último, rebobina un año antes de arrancar.
 */
export function useMonthPlayer(months: string[]) {
  const [, startTransition] = useTransition();
  const [month, setMonth] = useQueryState(
    "mes",
    monthParser.withOptions({ shallow: false, startTransition }),
  );
  const [playing, setPlaying] = useState(false);
  const last = months[months.length - 1];

  useEffect(() => {
    if (!playing) return;
    const index = months.indexOf(month);
    if (index === -1 || index >= months.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void setMonth(months[index + 1]!);
    }, PLAY_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [playing, month, months, setMonth]);

  const toggle = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (month === last) void setMonth(months[Math.max(0, months.length - 12)]!);
    setPlaying(true);
  };

  return { playing, toggle };
}
