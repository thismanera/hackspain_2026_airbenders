"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

import { ActionBadge } from "@/components/grifo/action-badge";
import { CompanyAvatar } from "@/components/grifo/company-avatar";
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
import type { PortfolioRow } from "@/lib/features/portfolio/types";

function hrefFor(row: PortfolioRow, month: string): string {
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
  row: PortfolioRow;
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
  rows,
  month,
  onOpenCompany,
  onOpenGroup,
}: { rows: PortfolioRow[]; month: string } & Openers) {
  const companyClick = (row: PortfolioRow) => (event: MouseEvent<HTMLAnchorElement>) => {
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
              <TableHead className="w-[24%]">Empresa</TableHead>
              <TableHead className="w-[11%]">Estado</TableHead>
              <TableHead className="w-[9%] text-right">Score</TableHead>
              <TableHead className="w-[10%] text-right">Δ 3 meses</TableHead>
              <TableHead className="w-[12%] text-center">Límite</TableHead>
              <TableHead className="w-[12%] text-right">Δ límite</TableHead>
              <TableHead className="w-[22%]">Acción</TableHead>
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
    </>
  );
}
