"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

import { ActionBadge } from "@/components/grifo/action-badge";
import { CompanyAvatar } from "@/components/grifo/company-avatar";
import { ShowMore, useVisibleRows } from "@/components/grifo/show-more";
import { StatusBadge } from "@/components/grifo/status-badge";
import {
  AlertFlag,
  DeltaFigure,
  MoneyDelta,
  MoneyFigure,
  ScoreFigure,
} from "@/components/grifo/table-figures";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IMPACT_TONE } from "@/components/grifo/company/forecast-impact";
import { cn } from "@/lib/core/utils";
import { formatEurosCompact, formatScore } from "@/lib/features/portfolio/format";
import type { PortfolioListRow } from "@/lib/features/portfolio/types";

/**
 * Dónde estará en 3 meses y qué le cuesta: score previsto, cambio de banda si lo
 * hay, y euros al año. El texto dice lo mismo que el color (PRODUCT §8.6). La
 * previsión va en sombra: informa, la acción de la fila no depende de ella.
 */
function ForecastCell({ row, align = "end" }: { row: PortfolioListRow; align?: "start" | "end" }) {
  const forecast = row.forecast;
  if (!forecast) return <span className="text-muted-foreground tabular-nums">—</span>;
  const { impact } = forecast;
  const money = impact.annualDelta;
  return (
    <span
      className={cn("flex flex-col leading-tight", align === "end" ? "items-end" : "items-start")}
    >
      <span className="flex items-center gap-1.5">
        <span className="font-medium tabular-nums">{formatScore(forecast.score3m)}</span>
        <span className={cn("font-mono text-xs", IMPACT_TONE[impact.tone])}>
          {impact.tone === "igual" ? forecast.band3m : `${impact.bandNow}→${impact.bandPred}`}
        </span>
      </span>
      <span
        className={cn(
          "text-xs tabular-nums",
          money === 0 ? "text-muted-foreground" : IMPACT_TONE[impact.tone],
        )}
      >
        {money === 0
          ? "mismo coste"
          : `${money > 0 ? "+" : "−"}${formatEurosCompact(Math.abs(money))}/año`}
      </span>
    </span>
  );
}

function hrefFor(row: PortfolioListRow, month: string): string {
  return `/cartera/${row.company.id}?mes=${month}`;
}

type Openers = {
  onOpenCompany?: (companyId: string) => void;
  onOpenGroup?: (groupId: string) => void;
};

function plainClick(event: MouseEvent<HTMLElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function GroupTag({
  row,
  onOpenGroup,
}: {
  row: PortfolioListRow;
  onOpenGroup?: (groupId: string) => void;
}) {
  if (!onOpenGroup || row.company.groupSize <= 1) {
    return <span className="text-muted-foreground font-mono text-xs">{row.company.groupId}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => onOpenGroup(row.company.groupId)}
      aria-label={`Abrir el grupo ${row.company.groupId}`}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring relative z-10 w-fit rounded-sm font-mono text-xs underline-offset-2 transition-colors duration-150 hover:underline focus-visible:ring-2 focus-visible:outline-none"
    >
      {row.company.groupId}
    </button>
  );
}

export function PortfolioTable({
  rows: allRows,
  month,
  resetKey,
  onOpenCompany,
  onOpenGroup,
}: { rows: PortfolioListRow[]; month: string; resetKey: string } & Openers) {
  const { visible: rows, hidden, showMore, showAll } = useVisibleRows(allRows, resetKey);
  const companyClick = (row: PortfolioListRow) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onOpenCompany || !plainClick(event)) return;
    event.preventDefault();
    onOpenCompany(row.company.id);
  };

  return (
    <>
      <div className="bg-card hidden overflow-hidden rounded-xl border lg:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[20%]">Empresa</TableHead>
              <TableHead className="w-[10%]">Estado</TableHead>
              <TableHead className="w-[8%] text-right">Score</TableHead>
              <TableHead className="w-[9%] text-right">Δ 3 meses</TableHead>
              <TableHead className="w-[13%] text-right">Previsión 3 m</TableHead>
              <TableHead className="w-[11%] text-center">Límite</TableHead>
              <TableHead className="w-[11%] text-right">Δ límite</TableHead>
              <TableHead className="w-[18%]">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.company.id} className="hover:bg-muted/40 relative">
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <CompanyAvatar companyId={row.company.id} size="sm" />
                    <span className="flex flex-col items-start leading-tight">
                      <Link
                        href={hrefFor(row, month)}
                        onClick={companyClick(row)}
                        className="focus-visible:ring-ring flex items-center gap-2 after:absolute after:inset-0 focus-visible:ring-2 focus-visible:outline-none"
                      >
                        <span className="font-mono text-sm font-medium">{row.company.id}</span>
                        <AlertFlag count={row.alertCount} />
                      </Link>
                      <GroupTag row={row} onOpenGroup={onOpenGroup} />
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge estado={row.estado} />
                </TableCell>
                <TableCell className="text-right">
                  <ScoreFigure value={row.score} muted={row.estado === "sin_datos"} />
                </TableCell>
                <TableCell className="text-right">
                  <DeltaFigure delta={row.trend3m} />
                </TableCell>
                <TableCell className="text-right">
                  <ForecastCell row={row} />
                </TableCell>
                <TableCell className="text-center">
                  <MoneyFigure
                    amount={row.eligible ? row.limit : 0}
                    previous={row.previousLimit}
                    align="center"
                    showDelta={false}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <MoneyDelta
                    amount={row.eligible ? row.limit : 0}
                    previous={row.previousLimit ?? 0}
                  />
                </TableCell>
                <TableCell>
                  <ActionBadge action={row.action} changed={row.changed} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-2 lg:hidden">
        {rows.map((row) => (
          <li key={row.company.id} className="bg-card relative rounded-xl border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <CompanyAvatar companyId={row.company.id} size="sm" />
                <span className="flex min-w-0 flex-col items-start leading-tight">
                  <Link
                    href={hrefFor(row, month)}
                    onClick={companyClick(row)}
                    className="focus-visible:ring-ring flex items-center gap-2 after:absolute after:inset-0 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="font-mono text-sm font-medium">{row.company.id}</span>
                    <AlertFlag count={row.alertCount} />
                  </Link>
                  <GroupTag row={row} onOpenGroup={onOpenGroup} />
                </span>
              </div>
              <StatusBadge estado={row.estado} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">Score</dt>
                <dd>
                  <ScoreFigure value={row.score} muted={row.estado === "sin_datos"} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Δ 3 meses</dt>
                <dd>
                  <DeltaFigure delta={row.trend3m} />
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground text-xs">Previsión 3 m</dt>
                <dd>
                  <ForecastCell row={row} align="start" />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Límite</dt>
                <dd>
                  <MoneyFigure
                    amount={row.eligible ? row.limit : 0}
                    previous={row.previousLimit}
                    align="start"
                    showDelta={false}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Δ límite</dt>
                <dd>
                  <MoneyDelta
                    amount={row.eligible ? row.limit : 0}
                    previous={row.previousLimit ?? 0}
                  />
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground text-xs">Acción</dt>
                <dd>
                  <ActionBadge action={row.action} changed={row.changed} />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <ShowMore hidden={hidden} onMore={showMore} onAll={showAll} noun="empresas" />
    </>
  );
}
