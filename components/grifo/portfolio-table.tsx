"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";
import Link from "next/link";

import { ActionBadge } from "@/components/grifo/action-badge";
import { StatusBadge } from "@/components/grifo/status-badge";
import { Sparkline, TrendDelta } from "@/components/grifo/trend";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/core/utils";
import { formatApr, formatEuros, formatPercent, formatScore } from "@/lib/features/portfolio/format";
import type { PortfolioRow } from "@/lib/features/portfolio/types";

function hrefFor(row: PortfolioRow, month: string): string {
  return `/cartera/${row.company.id}?mes=${month}`;
}

function LimitCell({ row }: { row: PortfolioRow }) {
  if (!row.eligible) {
    // Cerrar una línea viva y no haber tenido nunca ninguna se leen igual si
    // ambas dicen "sin línea". Cuando hay retirada, el importe retirado es el
    // dato de la fila.
    if (row.previousLimit > 0) {
      return (
        <span className="flex flex-col items-end leading-tight">
          <span className="font-medium tabular-nums">0 €</span>
          <span className="text-status-risk-fg text-xs tabular-nums">
            −{formatEuros(row.previousLimit)}
          </span>
        </span>
      );
    }
    return <span className="text-muted-foreground">Sin línea</span>;
  }
  const change =
    row.previousLimit > 0 ? Math.round((row.limit / row.previousLimit - 1) * 100) : null;

  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="font-medium tabular-nums">{formatEuros(row.limit)}</span>
      {change !== null && change !== 0 ? (
        <span
          className={cn(
            "text-xs tabular-nums",
            change > 0 ? "text-status-healthy-fg" : "text-status-watch-fg",
          )}
        >
          {change > 0 ? "+" : ""}
          {change} %
        </span>
      ) : null}
    </span>
  );
}

function AlertFlag({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      className="text-status-watch-fg inline-flex items-center gap-0.5 text-xs font-medium"
      title={`${count} ${count === 1 ? "alerta activa" : "alertas activas"}`}
    >
      <AlertTriangle aria-hidden className="size-3" />
      <span className="tabular-nums">{count}</span>
      <span className="sr-only">{count === 1 ? "alerta activa" : "alertas activas"}</span>
    </span>
  );
}

export function PortfolioTable({ rows, month }: { rows: PortfolioRow[]; month: string }) {
  return (
    <>
      {/* Escritorio: tabla densa. La fila entera es un enlace real, así que el
          teclado, el clic central y "abrir en pestaña nueva" funcionan solos. */}
      <div className="bg-card hidden overflow-hidden rounded-lg border lg:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[19%]">Empresa</TableHead>
              <TableHead className="w-[10%]">Estado</TableHead>
              <TableHead className="w-[10%] text-right">Score</TableHead>
              <TableHead className="w-[14%]">Tendencia 3 m</TableHead>
              <TableHead className="w-[7%]">Banda</TableHead>
              <TableHead className="w-[15%] text-right">Límite</TableHead>
              {/* Entre lg y xl no cabe todo. Caen primero las dos columnas que el
                  analista puede recuperar abriendo la ficha sin perder el triaje:
                  el precio (se deduce de la banda) y el chevron (decorativo, la
                  fila entera ya es un enlace). */}
              <TableHead className="hidden w-[8%] text-right xl:table-cell">TAE</TableHead>
              <TableHead className="w-[13%]">Acción</TableHead>
              <TableHead className="hidden w-[4%] xl:table-cell">
                <span className="sr-only">Abrir ficha</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.company.id} className="hover:bg-muted/40 relative">
                <TableCell>
                  <Link
                    href={hrefFor(row, month)}
                    className="focus-visible:ring-ring flex flex-col leading-tight after:absolute after:inset-0 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{row.company.id}</span>
                      <AlertFlag count={row.alertCount} />
                    </span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {row.company.groupId}
                      {row.company.groupSize > 1 ? (
                        <span className="hidden xl:inline"> · {row.company.groupSize} empresas</span>
                      ) : null}
                    </span>
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge estado={row.estado} />
                </TableCell>
                <TableCell className="text-right">
                  <span className="flex flex-col items-end leading-tight">
                    {/* Sin historia suficiente el score existe pero no se sostiene:
                        se pinta apagado para no afirmar lo que la confianza niega. */}
                    <span
                      className={cn(
                        "font-medium tabular-nums",
                        row.estado === "sin_datos" && "text-muted-foreground font-normal",
                      )}
                    >
                      {formatScore(row.score)}
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatPercent(row.confidence, 0)} conf.
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span className="hidden xl:block">
                      <Sparkline values={row.spark} direction={row.direction} />
                    </span>
                    <TrendDelta trend3m={row.trend3m} direction={row.direction} />
                  </span>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm">{row.band}</span>
                </TableCell>
                <TableCell className="text-right">
                  <LimitCell row={row} />
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-right tabular-nums xl:table-cell">
                  {row.apr === null ? "—" : formatApr(row.apr)}
                </TableCell>
                <TableCell>
                  <span className="flex flex-col items-start gap-0.5 leading-tight">
                    <ActionBadge action={row.action} changed={row.changed} />
                    {row.blockedBy ? (
                      <span className="text-muted-foreground px-2 text-xs">{row.blockedBy}</span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <ChevronRight aria-hidden className="text-muted-foreground size-4" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Móvil y tablet: la misma información apilada. Una tabla de nueve columnas
          con scroll horizontal no se tría ni con el pulgar ni en un iPad. */}
      <ul className="flex flex-col gap-2 lg:hidden">
        {rows.map((row) => (
          <li key={row.company.id} className="bg-card relative rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <Link
                href={hrefFor(row, month)}
                className="focus-visible:ring-ring flex min-w-0 flex-col leading-tight after:absolute after:inset-0 focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">{row.company.id}</span>
                  <AlertFlag count={row.alertCount} />
                </span>
                <span className="text-muted-foreground font-mono text-xs">{row.company.groupId}</span>
              </Link>
              <StatusBadge estado={row.estado} />
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">Score</dt>
                <dd
                  className={cn(
                    "font-medium tabular-nums",
                    row.estado === "sin_datos" && "text-muted-foreground font-normal",
                  )}
                >
                  {formatScore(row.score)}
                  <span className="text-muted-foreground ml-1 text-xs">
                    {formatPercent(row.confidence, 0)}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Tendencia</dt>
                <dd>
                  <TrendDelta trend3m={row.trend3m} direction={row.direction} />
                </dd>
              </div>
              <div className="text-right">
                <dt className="text-muted-foreground text-xs">Límite</dt>
                <dd className="text-sm">
                  <LimitCell row={row} />
                </dd>
              </div>
            </dl>

            <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5">
              <span className="flex min-w-0 items-center gap-1.5">
                <ActionBadge action={row.action} changed={row.changed} />
                {row.blockedBy ? (
                  <span className="text-muted-foreground truncate text-xs">{row.blockedBy}</span>
                ) : null}
              </span>
              <span className="text-muted-foreground shrink-0 font-mono text-xs">
                Banda {row.band}
                {row.apr === null ? "" : ` · ${formatApr(row.apr)}`}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
