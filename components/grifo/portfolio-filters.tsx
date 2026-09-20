"use client";

import { Search, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  activeFilterCount,
  type PortfolioSearchState,
} from "@/lib/features/portfolio/search-params";
import { ACCION, BANDA, DIRECCION, ESTADO } from "@/lib/features/portfolio/vocabulary";

type Update = Partial<PortfolioSearchState>;

/** Tiempo sin teclear antes de que la búsqueda viaje a la URL y al servidor. */
const SEARCH_DEBOUNCE_MS = 250;

export const ESTADO_OPTIONS = [
  { value: "todos", label: "Todos los estados" },
  ...(["riesgo", "vigilar", "sana", "sin_datos"] as const).map((key) => ({
    value: key,
    label: ESTADO[key].label,
  })),
];

const ACCION_OPTIONS = [
  { value: "todas", label: "Todas las acciones" },
  ...(["cerrar", "reducir", "mantener", "ampliar", "abrir"] as const).map((key) => ({
    value: key,
    label: ACCION[key].label,
  })),
];

export const DIRECCION_OPTIONS = [
  { value: "todas", label: "Cualquier tendencia" },
  ...(["deterioro", "estable", "mejora"] as const).map((key) => ({
    value: key,
    label: DIRECCION[key].label,
  })),
];

const BANDA_OPTIONS = [
  { value: "todas", label: "Todas las bandas" },
  ...(["A", "B", "C", "D"] as const).map((key) => ({
    value: key,
    label: `Banda ${BANDA[key].label}`,
  })),
];

const PREVISION_OPTIONS = [
  { value: "todas", label: "Cualquier previsión" },
  { value: "baja_banda", label: "Baja de banda en 3 m" },
  { value: "sube_banda", label: "Sube de banda en 3 m" },
  { value: "mantiene", label: "Mantiene la banda" },
];

export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  // Base UI pinta el valor crudo si no se le da hijo explícito, y el valor crudo
  // ("sin_datos") no es lo que nadie quiere leer en un desplegable.
  const selected = options.find((option) => option.value === value);

  return (
    <Select value={value} onValueChange={(next) => onChange(next as string)}>
      <SelectTrigger size="sm" aria-label={label}>
        <SelectValue>{selected?.label ?? value}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * El texto se escribe en local y se confirma al parar de teclear: cada cambio de
 * `q` es una petición nueva de la cartera filtrada, no puede ir tecla a tecla.
 * Si la URL cambia desde fuera ("Quitar filtros", atrás), el campo la sigue.
 */
function SearchInput({ value, onCommit }: { value: string; onCommit: (q: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [committed, setCommitted] = useState(value);
  const timer = useRef(0);

  // Un valor que no hemos confirmado nosotros viene de fuera: el campo lo adopta.
  if (value !== committed) {
    setCommitted(value);
    setDraft(value);
  }

  const change = (next: string) => {
    setDraft(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setCommitted(next);
      onCommit(next);
    }, SEARCH_DEBOUNCE_MS);
  };

  return (
    <Input
      type="search"
      value={draft}
      onChange={(event) => change(event.target.value)}
      placeholder="Buscar empresa o grupo"
      aria-label="Buscar por identificador de empresa o de grupo"
      className="h-8 pl-8"
    />
  );
}

export function PortfolioFilters({
  filters,
  onChange,
  onClear,
  shown,
  total,
}: {
  filters: PortfolioSearchState;
  onChange: (update: Update) => void;
  onClear: () => void;
  shown: number;
  total: number;
}) {
  const active = activeFilterCount(filters);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Ancho fijo a partir de sm y fila propia por debajo. Con `flex-1` el campo
          cede todo su espacio a los desplegables y se queda en la lupa sola. */}
      <div className="relative w-full sm:w-56 sm:shrink-0">
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        />
        <SearchInput value={filters.q} onCommit={(q) => onChange({ q })} />
      </div>

      <FilterSelect
        label="Filtrar por estado"
        value={filters.estado}
        options={ESTADO_OPTIONS}
        onChange={(value) => onChange({ estado: value as PortfolioSearchState["estado"] })}
      />
      <FilterSelect
        label="Filtrar por acción"
        value={filters.accion}
        options={ACCION_OPTIONS}
        onChange={(value) => onChange({ accion: value as PortfolioSearchState["accion"] })}
      />
      <FilterSelect
        label="Filtrar por tendencia"
        value={filters.direccion}
        options={DIRECCION_OPTIONS}
        onChange={(value) => onChange({ direccion: value as PortfolioSearchState["direccion"] })}
      />
      <FilterSelect
        label="Filtrar por banda"
        value={filters.banda}
        options={BANDA_OPTIONS}
        onChange={(value) => onChange({ banda: value as PortfolioSearchState["banda"] })}
      />
      <FilterSelect
        label="Filtrar por previsión a 3 meses"
        value={filters.prevision}
        options={PREVISION_OPTIONS}
        onChange={(value) => onChange({ prevision: value as PortfolioSearchState["prevision"] })}
      />

      {active > 0 ? (
        <Button variant="ghost" size="sm" onClick={onClear} className="h-8">
          <X aria-hidden className="size-4" />
          Quitar filtros
        </Button>
      ) : null}

      <p
        aria-live="polite"
        className="text-muted-foreground ml-auto text-xs whitespace-nowrap tabular-nums"
      >
        {shown === total ? `${total} empresas` : `${shown} de ${total} empresas`}
      </p>
    </div>
  );
}
