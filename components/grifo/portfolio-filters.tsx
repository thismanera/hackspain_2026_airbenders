"use client";

import { Search, X } from "lucide-react";

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

const ESTADO_OPTIONS = [
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

const DIRECCION_OPTIONS = [
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

function FilterSelect({
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
        <Input
          type="search"
          value={filters.q}
          onChange={(event) => onChange({ q: event.target.value })}
          placeholder="Buscar empresa o grupo"
          aria-label="Buscar por identificador de empresa o de grupo"
          className="h-8 pl-8"
        />
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

      {active > 0 ? (
        <Button variant="ghost" size="sm" onClick={onClear} className="h-8">
          <X aria-hidden className="size-4" />
          Quitar filtros
        </Button>
      ) : null}

      <p
        aria-live="polite"
        className="text-muted-foreground ml-auto text-xs tabular-nums whitespace-nowrap"
      >
        {shown === total ? `${total} empresas` : `${shown} de ${total} empresas`}
      </p>
    </div>
  );
}
