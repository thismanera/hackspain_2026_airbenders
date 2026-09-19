"use client";

import { Plus, X } from "lucide-react";

import { ActionBadge } from "@/components/grifo/action-badge";
import { CompanyAvatar } from "@/components/grifo/company-avatar";
import { StatusBadge } from "@/components/grifo/status-badge";
import { TrendDelta } from "@/components/grifo/trend";
import { Button } from "@/components/ui/button";
import { formatScore } from "@/lib/features/portfolio/format";
import type { CompanyFileResponse } from "@/lib/features/portfolio/types";

/** Una de las empresas comparadas: lo justo para reconocerla y quitarla. */
export function Slot({
  file,
  color,
  onRemove,
  onOpen,
}: {
  file: CompanyFileResponse;
  /** Color de serie que la identifica en el cubo y el gráfico. */
  color?: string;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const { latest } = file;
  return (
    <div
      className="bg-card relative flex flex-col gap-3 rounded-xl border p-4"
      style={color ? { borderLeftWidth: 3, borderLeftColor: color } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="focus-visible:ring-ring flex items-center gap-2 rounded-sm text-left leading-tight focus-visible:ring-2 focus-visible:outline-none"
        >
          <CompanyAvatar companyId={file.company.id} size="sm" />
          <span className="flex flex-col">
            <span className="font-mono text-sm font-medium">{file.company.id}</span>
            <span className="text-muted-foreground text-xs">
              {file.company.groupId}
              {file.company.groupSize > 1 ? ` · ${file.company.groupSize} empresas` : ""}
            </span>
          </span>
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label={`Quitar ${file.company.id}`}
        >
          <X aria-hidden className="size-4" />
        </Button>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-3xl leading-none font-semibold tracking-[-0.02em] tabular-nums">
          {formatScore(latest.score)}
        </p>
        <StatusBadge estado={latest.estado} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs">
        <TrendDelta trend3m={latest.trend3m} direction={latest.direction} />
        <ActionBadge action={latest.decision.action} />
      </div>
    </div>
  );
}

export function EmptySlot({ onAdd, index }: { onAdd: () => void; index: number }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="text-muted-foreground hover:border-foreground/30 hover:text-foreground focus-visible:ring-ring flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="bg-secondary flex size-8 items-center justify-center rounded-lg">
        <Plus aria-hidden className="size-4" />
      </span>
      {index === 0 ? "Elegir la primera empresa" : "Añadir otra empresa"}
    </button>
  );
}
