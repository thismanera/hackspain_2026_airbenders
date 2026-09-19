"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatInt } from "@/lib/features/portfolio/format";

const PAGE = 60;

/**
 * Listas largas por tramos: con 1.300 empresas, pintar todas las filas (y dos
 * veces, tabla y tarjetas) multiplica por diez el HTML y la hidratación. El
 * tramo vuelve al primero cuando cambia `resetKey` (filtros, mes...).
 */
export function useVisibleRows<T>(rows: T[], resetKey: string) {
  const [state, setState] = useState({ key: resetKey, limit: PAGE });
  const limit = state.key === resetKey ? state.limit : PAGE;
  const visible = rows.length > limit ? rows.slice(0, limit) : rows;
  return {
    visible,
    hidden: rows.length - visible.length,
    showMore: () => setState({ key: resetKey, limit: limit + PAGE }),
    showAll: () => setState({ key: resetKey, limit: rows.length }),
  };
}

export function ShowMore({
  hidden,
  onMore,
  onAll,
  noun,
}: {
  hidden: number;
  onMore: () => void;
  onAll: () => void;
  noun: string;
}) {
  if (hidden <= 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 py-2">
      <Button variant="outline" size="sm" onClick={onMore}>
        Mostrar {formatInt(Math.min(PAGE, hidden))} más
      </Button>
      {hidden > PAGE ? (
        <Button variant="ghost" size="sm" onClick={onAll}>
          Mostrar las {formatInt(hidden)} {noun} restantes
        </Button>
      ) : null}
    </div>
  );
}
