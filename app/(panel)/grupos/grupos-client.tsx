"use client";

import { AlertOctagon, ChevronRight, Landmark, Link2, Network } from "lucide-react";

import { PageIntro, StatCard } from "@/components/grifo/stat-card";
import { StatusBadge } from "@/components/grifo/status-badge";
import { EntitySheet } from "@/components/grifo/sheet/entity-sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/core/utils";
import {
  formatEuros,
  formatMonthLong,
  formatPercent,
  formatScore,
  formatSigned,
} from "@/lib/features/portfolio/format";
import { useGroups, useMonth, useSheetState } from "@/lib/features/portfolio/hooks";
import type { Estado, GroupRow } from "@/lib/features/portfolio/types";
import { ESTADO } from "@/lib/features/portfolio/vocabulary";

const ESTADO_ORDER: Estado[] = ["sana", "vigilar", "riesgo", "sin_datos"];
const ESTADO_BAR = {
  sana: "bg-status-healthy",
  vigilar: "bg-status-watch",
  riesgo: "bg-status-risk",
  sin_datos: "bg-status-none",
} satisfies Record<Estado, string>;

/** Una barra por grupo: cuántas empresas hay en cada estado, con la lista en texto para el lector. */
function HealthBar({ group }: { group: GroupRow }) {
  const parts = ESTADO_ORDER.filter((estado) => group.byEstado[estado] > 0);
  return (
    <span className="flex flex-col gap-1">
      <span aria-hidden className="bg-muted flex h-1.5 w-28 overflow-hidden rounded-full">
        {parts.map((estado) => (
          <span
            key={estado}
            className={cn("h-full", ESTADO_BAR[estado])}
            style={{ width: `${(group.byEstado[estado] / group.members) * 100}%` }}
          />
        ))}
      </span>
      <span className="text-muted-foreground text-xs tabular-nums">
        {parts
          .map((estado) => `${group.byEstado[estado]} ${ESTADO[estado].label.toLowerCase()}`)
          .join(" · ")}
      </span>
    </span>
  );
}

function ExposureCell({ group }: { group: GroupRow }) {
  const delta = group.exposure - group.previousExposure;
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="font-medium tabular-nums">{formatEuros(group.exposure)}</span>
      {delta !== 0 ? (
        <span
          className={cn(
            "text-xs tabular-nums",
            delta > 0 ? "text-status-healthy-fg" : "text-status-risk-fg",
          )}
        >
          {delta > 0 ? "+" : "−"}
          {formatEuros(Math.abs(delta))}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">sin cambio</span>
      )}
    </span>
  );
}

function Signals({ group }: { group: GroupRow }) {
  if (group.crossDefault.length > 0) {
    return (
      <span className="text-status-risk-fg inline-flex items-center gap-1 text-xs font-medium">
        <AlertOctagon aria-hidden className="size-3.5" />
        Cross-default: {group.crossDefault.join(", ")}
      </span>
    );
  }
  const parts: string[] = [];
  if (group.moved > 0) parts.push(`${group.moved} ${group.moved === 1 ? "cambio" : "cambios"}`);
  if (group.alertCount > 0)
    parts.push(`${group.alertCount} ${group.alertCount === 1 ? "alerta" : "alertas"}`);
  return (
    <span className="text-muted-foreground text-xs">
      {parts.length ? parts.join(" · ") : "Nada nuevo"}
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

  const openGroup = (groupId: string) =>
    void setSheet({ empresa: "", grupo: groupId, pestana: "decision" });

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        eyebrow="Grupos"
        title="El grupo no es prestatario: es el techo"
        description={
          <>
            {holdings.length} holdings con más de una empresa a cierre de{" "}
            {formatMonthLong(data.month)}
            {singles > 0 ? ` (y ${singles} empresas que van solas)` : ""}. Aval, contagio y techo se
            razonan aquí antes que en la ficha de cada empresa.
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Network}
          label="Holdings"
          value={holdings.length}
          hint={`${data.totalCompanies} empresas en la cartera`}
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
          hint="D5: cuánto de lo que cobra cada empresa viene de sus hermanas"
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
              <TableHead className="w-[16%]">Grupo</TableHead>
              <TableHead className="w-[10%]">Estado</TableHead>
              <TableHead className="w-[10%] text-right">Score</TableHead>
              <TableHead className="w-[18%]">Empresas</TableHead>
              <TableHead className="w-[9%] text-right">Con línea</TableHead>
              <TableHead className="w-[13%] text-right">Techo</TableHead>
              <TableHead className="w-[8%] text-right">D5</TableHead>
              <TableHead className="w-[13%]">Señales</TableHead>
              <TableHead className="w-[3%]">
                <span className="sr-only">Abrir grupo</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holdings.map((group) => {
              const delta = group.previousScore === null ? null : group.score - group.previousScore;
              return (
                <TableRow key={group.groupId} className="hover:bg-muted/40 relative">
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => openGroup(group.groupId)}
                      className="focus-visible:ring-ring flex flex-col items-start text-left leading-tight after:absolute after:inset-0 focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <span className="font-mono text-sm font-medium">{group.groupId}</span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {group.members} empresas · la mayor pesa {formatPercent(group.topShare, 0)}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell>
                    <StatusBadge estado={group.estado} />
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="flex flex-col items-end leading-tight">
                      <span className="font-medium tabular-nums">{formatScore(group.score)}</span>
                      {delta !== null && Math.abs(delta) >= 0.5 ? (
                        <span
                          className={cn(
                            "text-xs tabular-nums",
                            delta > 0 ? "text-status-healthy-fg" : "text-status-risk-fg",
                          )}
                        >
                          {formatSigned(delta)}
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell>
                    <HealthBar group={group} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {group.eligible} de {group.members}
                  </TableCell>
                  <TableCell className="text-right">
                    <ExposureCell group={group} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(group.interdependence, 0)}
                  </TableCell>
                  <TableCell>
                    <Signals group={group} />
                  </TableCell>
                  <TableCell>
                    <ChevronRight aria-hidden className="text-muted-foreground size-4" />
                  </TableCell>
                </TableRow>
              );
            })}
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
            <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">Score</dt>
                <dd className="font-medium tabular-nums">{formatScore(group.score)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Con línea</dt>
                <dd className="tabular-nums">
                  {group.eligible} de {group.members}
                </dd>
              </div>
              <div className="text-right">
                <dt className="text-muted-foreground text-xs">Techo</dt>
                <dd>
                  <ExposureCell group={group} />
                </dd>
              </div>
            </dl>
            <div className="mt-3 border-t pt-2.5">
              <Signals group={group} />
            </div>
          </li>
        ))}
      </ul>

      <EntitySheet month={data.month} />
    </div>
  );
}
