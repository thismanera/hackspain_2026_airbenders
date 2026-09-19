"use client";

import { Clock } from "lucide-react";

import { cn } from "@/lib/core/utils";
import { CALENDAR } from "@/lib/features/portfolio/calendar";
import {
  formatApr,
  formatEuros,
  formatMonthShort,
  formatScore,
  formatSigned,
} from "@/lib/features/portfolio/format";
import { BLOCKS } from "@/lib/features/portfolio/indicators";
import type {
  Alert,
  CompanyFileResponse,
  Decision,
  MonthScore,
} from "@/lib/features/portfolio/types";

/**
 * Las piezas de la ficha en panel lateral. Ninguna trae tarjeta propia: la
 * jerarquía la pone quien las compone, y así el analista no se encuentra ocho
 * cajas idénticas sin saber cuál leer primero.
 */

function leadMonthsOf(alert: Alert): number {
  return CALENDAR.indexOf(alert.confirmedMonth) - CALENDAR.indexOf(alert.onsetMonth);
}

function toneOf(previous: number, current: number, eligible: boolean): "up" | "down" | null {
  if (!eligible || previous === 0 || current === previous) return null;
  return current > previous ? "up" : "down";
}

/** Lo que había y lo que hay, en columnas: el recálculo del mes. */
export function ConditionsTable({ file }: { file: CompanyFileResponse }) {
  const current = file.latest.decision;
  const previous = file.previous?.decision ?? null;
  const previousMonth = file.previous?.month ?? null;
  const rows = [
    {
      label: "Límite",
      before: previous ? (previous.eligible ? formatEuros(previous.limit) : "Sin línea") : "—",
      now: current.eligible ? formatEuros(current.limit) : "Sin línea",
      tone: toneOf(previous?.limit ?? 0, current.limit, current.eligible),
    },
    {
      label: "TAE",
      before: previous ? (previous.eligible ? formatApr(previous.apr) : "No aplica") : "—",
      now: current.eligible ? formatApr(current.apr) : "No aplica",
      tone: null,
    },
    {
      label: "Plazo máximo",
      before: previous ? (previous.eligible ? `${previous.maxTenorDays} días` : "No aplica") : "—",
      now: current.eligible ? `${current.maxTenorDays} días` : "No aplica",
      tone: null,
    },
  ] as const;

  return (
    <table className="w-full table-fixed text-sm">
      <caption className="sr-only">
        Condiciones del mes anterior y del mes en curso, una fila por condición
      </caption>
      <thead>
        <tr className="text-muted-foreground border-b text-xs">
          <th scope="col" className="w-[34%] px-4 py-2.5 text-left font-medium">
            Condición
          </th>
          <th scope="col" className="px-3 py-2.5 text-left font-medium">
            Antes
            <span className="font-normal">
              {" "}
              · {previousMonth ? formatMonthShort(previousMonth) : "sin mes previo"}
            </span>
          </th>
          <th scope="col" className="bg-muted/50 px-3 py-2.5 text-left font-medium">
            <span className="text-foreground">Ahora</span>
            <span className="font-normal"> · {formatMonthShort(file.month)}</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row" className="px-4 py-2.5 text-left font-normal">
              {row.label}
            </th>
            <td className="text-muted-foreground px-3 py-2.5 tabular-nums">{row.before}</td>
            <td
              className={cn(
                "bg-muted/50 px-3 py-2.5 font-semibold tabular-nums",
                row.tone === "up" && "text-status-healthy-fg",
                row.tone === "down" && "text-status-watch-fg",
              )}
            >
              {row.now}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** El aviso que más pesa, con los meses que se ganaron. */
export function FeaturedAlert({ alerts }: { alerts: Alert[] }) {
  const alert = alerts.find((item) => item.severity === "critica") ?? alerts[0];
  if (!alert) return null;
  const lead = leadMonthsOf(alert);

  return (
    <p className="text-muted-foreground flex items-baseline gap-2 text-sm">
      <Clock aria-hidden className="size-3.5 shrink-0 translate-y-0.5" />
      <span className="text-pretty">
        <span className="text-foreground">{alert.label}</span>
        {lead > 0 ? (
          <span className="tabular-nums">
            {" "}
            · {lead} {lead === 1 ? "mes" : "meses"} de aviso
          </span>
        ) : null}
      </span>
    </p>
  );
}

export function TaeSplit({ decision }: { decision: Decision }) {
  const { aprBreakdown: split, apr, band } = decision;
  const rows = [
    { label: `Base de banda ${band}`, value: formatApr(split.base) },
    { label: "Prima de plazo (30 d)", value: formatApr(split.tenorPremium) },
    { label: "Prima de confianza", value: formatApr(split.confidencePremium) },
    { label: "Ajuste de tendencia", value: formatApr(split.trendAdjustment) },
    /* Solo el motor proyecta, y solo cobra prima si la previsión empeora la
       banda: cuando es cero, la fila no cuenta nada y no aparece. */
    ...(split.forecastPremium === 0
      ? []
      : [{ label: "Prima de previsión", value: formatApr(split.forecastPremium) }]),
  ];

  return (
    <dl className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
          <dt className="text-muted-foreground min-w-0">{row.label}</dt>
          <dd className="shrink-0 font-medium tabular-nums">{row.value}</dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 border-t pt-2 text-sm font-medium">
        <dt>TAE desde</dt>
        <dd className="tabular-nums">{formatApr(apr)}</dd>
      </div>
    </dl>
  );
}

export function ScoreBlocks({ month }: { month: MonthScore }) {
  const group = month.group?.adjustment ?? 0;
  const rows = [
    {
      id: "A",
      label: BLOCKS.A.label,
      weight: "45 %",
      value: month.blocks.A,
      display: formatScore(month.blocks.A),
      width: month.blocks.A,
    },
    {
      id: "B",
      label: BLOCKS.B.label,
      weight: "30 %",
      value: month.blocks.B,
      display: formatScore(month.blocks.B),
      width: month.blocks.B,
    },
    {
      id: "C",
      label: BLOCKS.C.label,
      weight: "25 %",
      value: month.blocks.C,
      display: formatScore(month.blocks.C),
      width: month.blocks.C,
    },
    {
      id: "D",
      label: "Aval o contagio de grupo",
      weight: "ajuste",
      value: group,
      display: formatSigned(group),
      width: Math.min(100, Math.abs(group) * (100 / 20)),
    },
  ];

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => {
        const weak = row.id === "D" ? row.value < 0 : row.value < 50;
        return (
          <li key={row.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
            <div className="min-w-0">
              <p className="flex items-baseline gap-2 text-sm">
                <span className="font-mono text-xs">{row.id}</span>
                <span>{row.label}</span>
                <span className="text-muted-foreground text-xs">{row.weight}</span>
              </p>
              <span className="bg-muted mt-1.5 block h-1.5 overflow-hidden rounded-full">
                <span
                  className={cn(
                    "block h-full rounded-full",
                    weak ? "bg-status-watch" : "bg-status-healthy",
                  )}
                  style={{ width: `${Math.max(4, Math.min(100, row.width))}%` }}
                />
              </span>
            </div>
            <span className="text-sm font-medium tabular-nums">{row.display}</span>
          </li>
        );
      })}
    </ul>
  );
}
