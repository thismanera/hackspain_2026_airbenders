"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { ActionBadge } from "@/components/grifo/action-badge";
import { CompanyAvatar } from "@/components/grifo/company-avatar";
import { GroupFlow } from "@/components/grifo/group/group-flow";
import { NarrativeCard } from "@/components/grifo/narrative-card";
import { Figure, Panel } from "@/components/grifo/panel";
import { StatusBadge, StatusDot } from "@/components/grifo/status-badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/core/utils";
import {
  formatEuros,
  formatMonthShort,
  formatMonthTick,
  formatPercent,
  formatScore,
  formatSigned,
} from "@/lib/features/portfolio/format";
import { useGroupFile } from "@/lib/features/portfolio/hooks";
import { groupNarrative } from "@/lib/features/portfolio/narrative";
import type { SheetTab } from "@/lib/features/portfolio/search-params";
import type { Estado, GroupFileResponse } from "@/lib/features/portfolio/types";
import { ESTADO } from "@/lib/features/portfolio/vocabulary";

const config = {
  score: { label: "Score consolidado", color: "var(--chart-3)" },
} satisfies ChartConfig;

const BAND_LINES = [
  { value: 75, label: "A" },
  { value: 60, label: "B" },
  { value: 45, label: "C" },
];

const ESTADO_ORDER = [
  "riesgo",
  "vigilar",
  "sana",
  "sin_datos",
] as const satisfies readonly Estado[];

function EstadoSummary({ byEstado }: { byEstado: Record<Estado, number> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {ESTADO_ORDER.filter((estado) => byEstado[estado] > 0).map((estado) => (
        <li key={estado} className="flex items-center gap-1.5">
          <StatusDot estado={estado} />
          <span className="tabular-nums">
            {byEstado[estado]} {ESTADO[estado].label.toLowerCase()}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MembersTable({
  group,
  onOpenCompany,
}: {
  group: GroupFileResponse;
  onOpenCompany: (companyId: string) => void;
}) {
  return (
    <Panel
      title="Las empresas del grupo"
      description="El crédito se concede a cada una; el grupo solo pone el techo y el contexto."
      bodyClassName="p-0"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-xs">
            <th scope="col" className="px-4 py-2 text-left font-medium">
              Empresa
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Peso
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Score
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Límite
            </th>
            <th scope="col" className="px-2 py-2 text-left font-medium">
              Acción
            </th>
            <th scope="col" className="w-8 px-2 py-2">
              <span className="sr-only">Abrir</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {group.members.map((member) => (
            <tr
              key={member.id}
              className="hover:bg-muted/40 relative transition-colors duration-150"
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <CompanyAvatar companyId={member.id} size="sm" />
                  <button
                    type="button"
                    onClick={() => onOpenCompany(member.id)}
                    className="focus-visible:ring-ring flex flex-col items-start text-left leading-tight after:absolute after:inset-0 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="flex items-center gap-2 font-mono font-medium">
                      {member.id}
                      {member.alertCount > 0 ? (
                        <span className="text-status-watch-fg inline-flex items-center gap-0.5 text-xs">
                          <AlertTriangle aria-hidden className="size-3" />
                          <span className="tabular-nums">{member.alertCount}</span>
                          <span className="sr-only">alertas</span>
                        </span>
                      ) : null}
                    </span>
                    <StatusBadge estado={member.estado} className="mt-1" />
                  </button>
                </div>
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {formatPercent(member.share, 0)}
              </td>
              <td className="px-2 py-2.5 text-right">
                <span className="flex flex-col items-end leading-tight">
                  <span className="font-medium tabular-nums">{formatScore(member.score)}</span>
                  {Math.abs(member.adjustment) >= 0.5 ? (
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        member.adjustment > 0 ? "text-status-healthy-fg" : "text-status-risk-fg",
                      )}
                    >
                      {formatSigned(member.adjustment)} grupo
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {member.eligible ? (
                  formatEuros(member.limit)
                ) : (
                  <span className="text-muted-foreground">Sin línea</span>
                )}
              </td>
              <td className="px-2 py-2.5">
                <span className="flex flex-col items-start gap-0.5 leading-tight">
                  <ActionBadge action={member.action} changed={member.changed} />
                  {member.blockedBy ? (
                    <span className="text-muted-foreground px-2 text-xs">{member.blockedBy}</span>
                  ) : null}
                </span>
              </td>
              <td className="px-2 py-2.5">
                <ChevronRight aria-hidden className="text-muted-foreground size-4" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function GroupScoreTrend({ group }: { group: GroupFileResponse }) {
  const data = group.history.map((point) => ({
    month: point.month,
    score: Math.round(point.score * 10) / 10,
  }));

  return (
    <Panel
      title="Score consolidado"
      description="Media de las empresas ponderada por su peso en el grupo, mes a mes."
    >
      <ChartContainer config={config} className="h-48 w-full">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={formatMonthTick}
            minTickGap={24}
          />
          <YAxis domain={[0, 100]} ticks={[0, 45, 60, 75, 100]} tickLine={false} axisLine={false} />
          {BAND_LINES.map((line) => (
            <ReferenceLine
              key={line.value}
              y={line.value}
              stroke="var(--border)"
              strokeDasharray="2 4"
              label={{
                value: line.label,
                position: "right",
                fontSize: 10,
                fill: "var(--muted-foreground)",
              }}
            />
          ))}
          <ChartTooltip
            content={
              <ChartTooltipContent labelFormatter={(value) => formatMonthShort(String(value))} />
            }
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="var(--color-score)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </Panel>
  );
}

function MemberScores({
  group,
  onOpenCompany,
}: {
  group: GroupFileResponse;
  onOpenCompany: (companyId: string) => void;
}) {
  return (
    <Panel
      title="Quién aporta y quién pesa"
      description="Cada barra es el score de una empresa; al lado, lo que el grupo le suma o resta."
      bodyClassName="p-0"
    >
      <ul className="divide-y">
        {group.members.map((member) => (
          <li key={member.id}>
            <button
              type="button"
              onClick={() => onOpenCompany(member.id)}
              className="hover:bg-muted/50 focus-visible:ring-ring grid w-full grid-cols-[minmax(0,1fr)_3rem_minmax(0,8rem)_4rem] items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 focus-visible:ring-2 focus-visible:-outline-offset-2 focus-visible:outline-none"
            >
              <span className="flex min-w-0 items-center gap-2">
                <CompanyAvatar companyId={member.id} size="sm" className="shrink-0" />
                <StatusDot estado={member.estado} />
                <span className="truncate font-mono text-sm">{member.id}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {formatPercent(member.share, 0)}
                </span>
              </span>
              <span className="text-right text-sm font-medium tabular-nums">
                {formatScore(member.score)}
              </span>
              <span aria-hidden className="bg-muted flex h-1.5 overflow-hidden rounded-full">
                <span
                  className={cn(
                    "h-full rounded-full",
                    member.score >= 70
                      ? "bg-status-healthy"
                      : member.score >= 45
                        ? "bg-status-watch"
                        : "bg-status-risk",
                  )}
                  style={{ width: `${Math.max(2, member.score)}%` }}
                />
              </span>
              <span
                className={cn(
                  "text-right text-xs tabular-nums",
                  Math.abs(member.adjustment) < 0.5
                    ? "text-muted-foreground"
                    : member.adjustment > 0
                      ? "text-status-healthy-fg"
                      : "text-status-risk-fg",
                )}
              >
                {formatSigned(member.adjustment)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function GroupSheet({
  groupId,
  month,
  tab,
  onTabChange,
  onOpenCompany,
}: {
  groupId: string;
  month: string;
  tab: SheetTab;
  onTabChange: (tab: SheetTab) => void;
  onOpenCompany: (companyId: string) => void;
}) {
  const { data } = useGroupFile(groupId, month);
  const exposureDelta = data.exposure - data.previousExposure;
  const scoreDelta = data.previousScore === null ? null : data.score - data.previousScore;

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTabChange(value as SheetTab)}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <header className="flex flex-col gap-3 border-b px-5 pt-5 pb-0">
        <div className="min-w-0 pr-8">
          <p className="text-muted-foreground text-xs">Cartera / Grupo · no es prestatario</p>
          <SheetTitle className="mt-1 font-mono text-lg font-semibold tracking-[-0.01em]">
            {data.groupId}
          </SheetTitle>
          <SheetDescription
            render={<div />}
            className="mt-1 flex flex-wrap items-center gap-x-2 text-xs"
          >
            <span className="tabular-nums">
              {data.members.length} empresas · {formatMonthShort(month)}
            </span>
            <span aria-hidden>·</span>
            <EstadoSummary byEstado={data.byEstado} />
          </SheetDescription>
        </div>

        <TabsList variant="line" className="-mb-px h-9 gap-4 p-0">
          <TabsTrigger value="decision" className="px-0 text-sm">
            Circulante
          </TabsTrigger>
          <TabsTrigger value="score" className="px-0 text-sm">
            Score
          </TabsTrigger>
          <TabsTrigger value="grupo" className="px-0 text-sm">
            Flujo
          </TabsTrigger>
        </TabsList>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <TabsContent value="decision" className="flex flex-col gap-4">
          <NarrativeCard title="Qué tienes que saber del grupo" narrative={groupNarrative(data)} />

          <section aria-label="Cifras del grupo" className="bg-card rounded-xl border p-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <Figure
                label="Límite conjunto"
                value={formatEuros(data.exposure)}
                hint={
                  exposureDelta !== 0 ? (
                    <span
                      className={
                        exposureDelta > 0 ? "text-status-healthy-fg" : "text-status-watch-fg"
                      }
                    >
                      {formatSigned(exposureDelta, 0)} € este mes
                    </span>
                  ) : (
                    "Sin cambio este mes"
                  )
                }
              />
              <Figure
                label="Con línea"
                value={`${data.eligible} de ${data.members.length}`}
                hint={
                  data.crossDefault.length > 0
                    ? `Cross-default: ${data.crossDefault.join(", ")}`
                    : "Ninguna caída con peso relevante"
                }
              />
              <Figure
                label="Score consolidado"
                value={formatScore(data.score)}
                hint={
                  scoreDelta !== null ? (
                    <span
                      className={cn(
                        Math.abs(scoreDelta) < 0.5
                          ? ""
                          : scoreDelta > 0
                            ? "text-status-healthy-fg"
                            : "text-status-risk-fg",
                      )}
                    >
                      {formatSigned(scoreDelta)} frente al mes pasado
                    </span>
                  ) : undefined
                }
              />
              <Figure
                label="Interdependencia"
                value={formatPercent(data.interdependence, 0)}
                hint="D5 medio, ponderado por peso"
              />
            </dl>
          </section>

          {data.crossDefault.length > 0 ? (
            <p className="bg-status-risk-surface text-status-risk-fg flex items-start gap-2.5 rounded-xl border p-4 text-sm text-pretty">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-medium">Cross-default.</span> {data.crossDefault.join(", ")}{" "}
                cierra con un peso del 30 % o más del grupo. Las hermanas bajan una banda este mes
                y, si sigue cerrada, la puerta de grupo les fallará el próximo.
              </span>
            </p>
          ) : null}

          <MembersTable group={data} onOpenCompany={onOpenCompany} />
        </TabsContent>

        <TabsContent value="score" className="flex flex-col gap-4">
          <GroupScoreTrend group={data} />
          <MemberScores group={data} onOpenCompany={onOpenCompany} />
        </TabsContent>

        <TabsContent value="grupo" className="flex flex-col gap-4">
          <GroupFlow group={data} month={month} onOpenCompany={onOpenCompany} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
