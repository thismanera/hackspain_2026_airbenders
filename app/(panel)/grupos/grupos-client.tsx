"use client";

import { AlertOctagon, Landmark, Link2, Network } from "lucide-react";

import { EntitySheet } from "@/components/grifo/sheet/entity-sheet";
import { PageIntro, StatCard } from "@/components/grifo/stat-card";
import { StatusBadge } from "@/components/grifo/status-badge";
import { DeltaFigure, MoneyFigure, ScoreFigure } from "@/components/grifo/table-figures";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatEuros, formatMonthLong, formatPercent } from "@/lib/features/portfolio/format";
import { useGroups, useMonth, useSheetState } from "@/lib/features/portfolio/hooks";
import type { GroupRow } from "@/lib/features/portfolio/types";

function monthNews(group: GroupRow): { text: string; tone: "risk" | "muted" } | null {
  if (group.crossDefault.length > 0) {
    const names = group.crossDefault.join(", ");
    const many = group.crossDefault.length > 1;
    return {
      text: `${names} ${many ? "cierran y arrastran" : "cierra y arrastra"} al grupo`,
      tone: "risk",
    };
  }
  const parts: string[] = [];
  if (group.moved > 0) {
    parts.push(group.moved === 1 ? "1 línea cambia" : `${group.moved} líneas cambian`);
  }
  if (group.alertCount > 0) {
    parts.push(group.alertCount === 1 ? "1 alerta" : `${group.alertCount} alertas`);
  }
  if (parts.length === 0) return null;
  return { text: parts.join(" · "), tone: "muted" };
}

function MonthNews({ group }: { group: GroupRow }) {
  const news = monthNews(group);
  if (!news) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={
        news.tone === "risk"
          ? "text-status-risk-fg inline-flex items-center gap-1 text-sm text-pretty"
          : "text-muted-foreground text-sm text-pretty"
      }
    >
      {news.tone === "risk" ? <AlertOctagon aria-hidden className="size-3.5 shrink-0" /> : null}
      {news.text}
    </span>
  );
}

export function GruposClient() {
  const [{ mes }] = useMonth();
  const { data } = useGroups(mes);
  const [, setSheet] = useSheetState();

  const holdings = data.groups.filter((group) => group.members > 1);
  const singles = data.groups.length - holdings.length;
  const withCross = holdings.filter((group) => group.crossDefault.length > 0);
  const exposure = holdings.reduce((sum, group) => sum + group.exposure, 0);
  const previousExposure = holdings.reduce((sum, group) => sum + group.previousExposure, 0);
  const avgInterdependence = holdings.length
    ? holdings.reduce((sum, group) => sum + group.interdependence, 0) / holdings.length
    : 0;
  const tightlyLinked = holdings.filter((group) => group.interdependence >= 0.2).length;

  const openGroup = (groupId: string) =>
    void setSheet({ empresa: "", grupo: groupId, pestana: "decision" });

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        title="El grupo no es prestatario: es el techo"
        description={
          <>
            {holdings.length} holdings a cierre de {formatMonthLong(data.month)}
            {singles > 0 ? `; ${singles} empresas van solas` : ""}.
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Network}
          label="Holdings"
          value={holdings.length}
          hint={`${holdings.reduce((sum, group) => sum + group.members, 0)} empresas bajo un techo conjunto`}
        />
        <StatCard
          icon={Landmark}
          label="Techo conjunto"
          value={formatEuros(exposure)}
          hint={
            exposure - previousExposure === 0
              ? "Sin cambio frente al mes pasado"
              : `${exposure > previousExposure ? "+" : "−"}${formatEuros(Math.abs(exposure - previousExposure))} frente al mes pasado`
          }
        />
        <StatCard
          icon={Link2}
          label="Interdependencia media"
          value={formatPercent(avgInterdependence, 0)}
          hint={
            tightlyLinked > 0
              ? `${tightlyLinked} de ${holdings.length} facturan más de un 20 % entre hermanas`
              : "Ningún grupo factura más de un 20 % entre hermanas"
          }
        />
        <StatCard
          icon={AlertOctagon}
          label="Con cross-default"
          value={withCross.length}
          tone={withCross.length > 0 ? "risk" : "neutral"}
          hint={
            withCross.length > 0
              ? "Una empresa con peso relevante cierra y arrastra a las demás"
              : "Ninguna caída con peso relevante este mes"
          }
        />
      </div>

      <div className="bg-card hidden overflow-hidden rounded-xl border lg:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[22%]">Grupo</TableHead>
              <TableHead className="w-[12%]">Estado</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Δ 3 meses</TableHead>
              <TableHead className="text-right">Con línea</TableHead>
              <TableHead className="text-center">Techo</TableHead>
              <TableHead>Este mes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holdings.map((group) => (
              <TableRow key={group.groupId} className="hover:bg-muted/40 relative">
                <TableCell>
                  <button
                    type="button"
                    onClick={() => openGroup(group.groupId)}
                    className="focus-visible:ring-ring flex flex-col items-start text-left leading-tight after:absolute after:inset-0 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="font-mono text-sm font-medium">{group.groupId}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {group.members} {group.members === 1 ? "empresa" : "empresas"}
                    </span>
                  </button>
                </TableCell>
                <TableCell>
                  <StatusBadge estado={group.estado} />
                </TableCell>
                <TableCell className="text-right">
                  <ScoreFigure value={group.score} />
                </TableCell>
                <TableCell className="text-right">
                  <DeltaFigure
                    delta={group.previousScore === null ? null : group.score - group.previousScore}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {group.eligible} de {group.members}
                </TableCell>
                <TableCell className="text-center">
                  <MoneyFigure
                    amount={group.exposure}
                    previous={group.previousExposure}
                    empty="0 €"
                    align="center"
                  />
                </TableCell>
                <TableCell>
                  <MonthNews group={group} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-2 lg:hidden">
        {holdings.map((group) => (
          <li key={group.groupId} className="bg-card relative rounded-xl border p-3">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => openGroup(group.groupId)}
                className="focus-visible:ring-ring flex flex-col items-start text-left leading-tight after:absolute after:inset-0 focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="font-mono text-sm font-medium">{group.groupId}</span>
                <span className="text-muted-foreground text-xs">{group.members} empresas</span>
              </button>
              <StatusBadge estado={group.estado} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">Score</dt>
                <dd>
                  <ScoreFigure value={group.score} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Δ 3 meses</dt>
                <dd>
                  <DeltaFigure
                    delta={group.previousScore === null ? null : group.score - group.previousScore}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Con línea</dt>
                <dd className="tabular-nums">
                  {group.eligible} de {group.members}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Techo</dt>
                <dd>
                  <MoneyFigure
                    amount={group.exposure}
                    previous={group.previousExposure}
                    empty="0 €"
                    align="start"
                  />
                </dd>
              </div>
            </dl>
            {monthNews(group) ? (
              <div className="mt-3 border-t pt-2.5">
                <MonthNews group={group} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <EntitySheet month={data.month} />
    </div>
  );
}
