"use client";

import type { ReactNode } from "react";

import { ActionBadge } from "@/components/grifo/action-badge";
import { TrendDelta } from "@/components/grifo/trend";
import { cn } from "@/lib/core/utils";
import {
  formatApr,
  formatDays,
  formatEuros,
  formatPercent,
  formatScore,
  formatSigned,
} from "@/lib/features/portfolio/format";
import { BLOCKS, type BlockId } from "@/lib/features/portfolio/indicators";
import type { CompanyFileResponse } from "@/lib/features/portfolio/types";
import { BANDA, NATURALEZA } from "@/lib/features/portfolio/vocabulary";

type RowSpec = {
  label: string;
  cell: (file: CompanyFileResponse) => ReactNode;
  /** Valor numérico para resaltar el mejor; `null` desactiva el resalte. */
  best?: (file: CompanyFileResponse) => number | null;
  higherIsBetter?: boolean;
};

const ROWS: RowSpec[] = [
  {
    label: "Score",
    cell: (f) => <span className="font-medium tabular-nums">{formatScore(f.latest.score)}</span>,
    best: (f) => f.latest.score,
    higherIsBetter: true,
  },
  {
    label: "Confianza",
    cell: (f) => <span className="tabular-nums">{formatPercent(f.latest.confidence, 0)}</span>,
  },
  {
    label: "Tendencia 3 m",
    cell: (f) => <TrendDelta trend3m={f.latest.trend3m} direction={f.latest.direction} />,
  },
  {
    label: "Naturaleza",
    cell: (f) => <span className="text-sm">{NATURALEZA[f.latest.nature].label}</span>,
  },
  {
    label: "Banda",
    cell: (f) => (
      <span className="text-sm">
        <span className="font-mono font-medium">{f.latest.decision.band}</span>
        <span className="text-muted-foreground">
          {" "}
          · {BANDA[f.latest.decision.band].description}
        </span>
      </span>
    ),
  },
  {
    label: "Acción",
    cell: (f) => <ActionBadge action={f.latest.decision.action} />,
  },
  {
    label: "Límite",
    cell: (f) => (
      <span className="tabular-nums">
        {f.latest.decision.eligible ? (
          formatEuros(f.latest.decision.limit)
        ) : (
          <span className="text-muted-foreground">Sin línea</span>
        )}
      </span>
    ),
    best: (f) => (f.latest.decision.eligible ? f.latest.decision.limit : null),
    higherIsBetter: true,
  },
  {
    label: "TAE",
    cell: (f) =>
      f.latest.decision.eligible ? (
        <span className="tabular-nums">{formatApr(f.latest.decision.apr)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    best: (f) => (f.latest.decision.eligible ? f.latest.decision.apr : null),
    higherIsBetter: false,
  },
  {
    label: "Plazo máximo",
    cell: (f) =>
      f.latest.decision.eligible ? (
        <span className="tabular-nums">{formatDays(f.latest.decision.maxTenorDays)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    label: "Puerta que falla",
    cell: (f) => {
      const failed = f.latest.decision.gates.find((gate) => !gate.passed);
      return failed ? (
        <span className="text-sm">{failed.label}</span>
      ) : (
        <span className="text-muted-foreground">Ninguna</span>
      );
    },
  },
  ...(Object.keys(BLOCKS) as BlockId[]).map(
    (block): RowSpec => ({
      label: `Bloque ${block} · ${BLOCKS[block].label}`,
      cell: (f) => <span className="tabular-nums">{formatScore(f.latest.blocks[block])}</span>,
      best: (f) => f.latest.blocks[block],
      higherIsBetter: true,
    }),
  ),
  {
    label: "Ajuste de grupo",
    cell: (f) =>
      f.latest.group ? (
        <span className="tabular-nums">
          {formatSigned(f.latest.score - f.latest.standaloneScore)} pts
        </span>
      ) : (
        <span className="text-muted-foreground">Va sola</span>
      ),
  },
  {
    label: "Alertas activas",
    cell: (f) => <span className="tabular-nums">{f.latest.alerts.length}</span>,
    best: (f) => f.latest.alerts.length,
    higherIsBetter: false,
  },
];

function bestIndex(row: RowSpec, files: CompanyFileResponse[]): number | null {
  if (!row.best || files.length < 2) return null;
  const values = files.map((file) => row.best?.(file) ?? null);
  const valid = values.filter((value): value is number => value !== null);
  if (valid.length < 2) return null;
  const target = row.higherIsBetter ? Math.max(...valid) : Math.min(...valid);
  const ties = values.filter((value) => value === target).length;
  return ties === 1 ? values.indexOf(target) : null;
}

/** Los mismos números para cada empresa, una fila por dato; el mejor, resaltado. */
export function CompareTable({ files }: { files: CompanyFileResponse[] }) {
  return (
    <div className="bg-card overflow-hidden rounded-[14px] border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th
              scope="col"
              className="text-muted-foreground w-[28%] px-4 py-2.5 text-left text-xs font-medium"
            >
              Dato
            </th>
            {files.map((file) => (
              <th
                key={file.company.id}
                scope="col"
                className="px-4 py-2.5 text-left font-mono text-xs font-medium"
              >
                {file.company.id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {ROWS.map((row) => {
            const best = bestIndex(row, files);
            return (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="text-muted-foreground px-4 py-2.5 text-left text-xs font-normal"
                >
                  {row.label}
                </th>
                {files.map((file, index) => (
                  <td
                    key={file.company.id}
                    className={cn(
                      "px-4 py-2.5 align-middle",
                      best === index && "bg-status-healthy-surface/60",
                    )}
                  >
                    {row.cell(file)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
