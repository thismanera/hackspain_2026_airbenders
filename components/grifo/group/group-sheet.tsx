"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { ActionBadge } from "@/components/grifo/action-badge";
import { ReadingBox } from "@/components/grifo/declared-reading";
import { GroupFlow } from "@/components/grifo/group/group-flow";
import { Figure, Panel } from "@/components/grifo/panel";
import { StatusDot } from "@/components/grifo/status-badge";
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
    <Panel title="Las empresas del grupo" bodyClassName="p-0">
      {/* En la hoja estrecha la fila no cabe entera, y el panel la recorta:
          mejor que se desplace a que se pierda. */}
      <div className="overflow-x-auto">
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
                  <button
                    type="button"
                    onClick={() => onOpenCompany(member.id)}
                    className="focus-visible:ring-ring flex items-center gap-2 text-left after:absolute after:inset-0 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <StatusDot estado={member.estado} />
                    <span className="font-mono font-medium">{member.id}</span>
                    <span className="sr-only">{ESTADO[member.estado].label}</span>
                    {member.alertCount > 0 ? (
                      <span className="text-status-watch-fg inline-flex items-center gap-0.5 text-xs">
                        <AlertTriangle aria-hidden className="size-3" />
                        <span className="tabular-nums">{member.alertCount}</span>
                        <span className="sr-only">alertas</span>
                      </span>
                    ) : null}
                  </button>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {formatPercent(member.share, 0)}
                </td>
                {/* Lo que el grupo suma o resta al score es la columna de la
                    pestaña Score, con su barra. Aquí solo hace falta el score
                    con el que se decide. */}
                <td className="px-2 py-2.5 text-right font-medium tabular-nums">
                  {formatScore(member.score)}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {member.eligible ? (
                    formatEuros(member.limit)
                  ) : (
                    <span className="text-muted-foreground">Sin línea</span>
                  )}
                </td>
                {/* La columna del límite ya ha dicho "Sin línea": repetirlo como
                    acción era el ruido de la fila. Si no hay nada que hacer, lo
                    útil es qué puerta lo impide; si lo hay, la pastilla, que
                    solo se tiñe cuando la acción es noticia. */}
                <td className="px-2 py-2.5">
                  {member.eligible || member.changed ? (
                    <ActionBadge
                      action={member.action}
                      changed={member.changed}
                      className="-ml-1.5"
                    />
                  ) : (
                    <span className="text-muted-foreground">{member.blockedBy ?? "—"}</span>
                  )}
                </td>
                <td className="px-2 py-2.5">
                  <ChevronRight aria-hidden className="text-muted-foreground size-4" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function GroupScoreTrend({ group }: { group: GroupFileResponse }) {
  const data = group.history.map((point) => ({
    month: point.month,
    score: Math.round(point.score * 10) / 10,
  }));

  return (
    <Panel title="Score consolidado" description="Media de las empresas, ponderada por su peso.">
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

/* La barra es la única columna prescindible: en pantalla estrecha desaparece
   para que el identificador y las tres cifras quepan sin truncarse. */
const MEMBER_SCORE_GRID =
  "grid w-full grid-cols-[minmax(0,1fr)_2rem_1.75rem_2.25rem] items-center gap-2 px-4 text-xs sm:grid-cols-[minmax(0,1fr)_3rem_3rem_minmax(0,6rem)_3.5rem] sm:gap-3 sm:text-sm";

function MemberScores({
  group,
  onOpenCompany,
}: {
  group: GroupFileResponse;
  onOpenCompany: (companyId: string) => void;
}) {
  return (
    <Panel title="Quién aporta y quién pesa" bodyClassName="p-0">
      {/* Una fila de cabecera nombra las cuatro columnas de una vez, en lugar de
          una frase que las describa por debajo del título. */}
      <div
        className={cn(
          MEMBER_SCORE_GRID,
          "text-muted-foreground border-b py-2 font-medium sm:text-xs",
        )}
      >
        <span>Empresa</span>
        <span className="text-right">Peso</span>
        <span className="text-right sm:col-span-2 sm:text-left">Score</span>
        <span className="text-right">Grupo</span>
      </div>
      <ul className="divide-y">
        {group.members.map((member) => (
          <li key={member.id}>
            <button
              type="button"
              onClick={() => onOpenCompany(member.id)}
              className={cn(
                MEMBER_SCORE_GRID,
                "hover:bg-muted/50 focus-visible:ring-ring py-2.5 text-left transition-colors duration-150 focus-visible:ring-2 focus-visible:-outline-offset-2 focus-visible:outline-none",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <StatusDot estado={member.estado} />
                <span className="truncate font-mono">{member.id}</span>
                <span className="sr-only">{ESTADO[member.estado].label}</span>
              </span>
              <span className="text-muted-foreground text-right tabular-nums">
                {formatPercent(member.share, 0)}
              </span>
              <span className="text-right font-medium tabular-nums">
                {formatScore(member.score)}
              </span>
              <span
                aria-hidden
                className="bg-muted hidden h-1.5 overflow-hidden rounded-full sm:flex"
              >
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
                  "text-right tabular-nums",
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
      <header className="flex flex-col gap-2 border-b px-5 pt-4 pb-0">
        <div className="min-w-0 pr-8">
          <SheetTitle className="font-mono text-lg font-semibold tracking-[-0.01em]">
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

        <TabsList variant="line" className="h-9 gap-4 p-0">
          <TabsTrigger value="decision" className="px-0 text-sm after:!bottom-[-1px]">
            Circulante
          </TabsTrigger>
          <TabsTrigger value="score" className="px-0 text-sm after:!bottom-[-1px]">
            Score
          </TabsTrigger>
          <TabsTrigger value="grupo" className="px-0 text-sm after:!bottom-[-1px]">
            Flujo
          </TabsTrigger>
        </TabsList>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <TabsContent value="decision" className="flex flex-col gap-4">
          {/* Sin Helmcode para grupo: el titular sale de la plantilla, pero se
              presenta en la misma caja que en empresa para que la lectura se
              reconozca igual en los dos lados. */}
          <ReadingBox headline={groupNarrative(data).headline} source="plantilla" />

          <section aria-label="Cifras del grupo" className="bg-card rounded-xl border px-4 py-3">
            <dl className="grid grid-cols-4 gap-x-3">
              <Figure
                label="Límite"
                value={
                  <>
                    {formatEuros(data.exposure)}
                    {exposureDelta !== 0 ? (
                      <span
                        className={cn(
                          "ml-1.5 text-xs font-medium",
                          exposureDelta > 0 ? "text-status-healthy-fg" : "text-status-watch-fg",
                        )}
                      >
                        {formatSigned(exposureDelta, 0)}
                      </span>
                    ) : null}
                  </>
                }
              />
              <Figure label="Con línea" value={`${data.eligible} / ${data.members.length}`} />
              <Figure
                label="Score"
                value={
                  <>
                    {formatScore(data.score)}
                    {scoreDelta !== null && Math.abs(scoreDelta) >= 0.5 ? (
                      <span
                        className={cn(
                          "ml-1.5 text-xs font-medium",
                          scoreDelta > 0 ? "text-status-healthy-fg" : "text-status-risk-fg",
                        )}
                      >
                        {formatSigned(scoreDelta)}
                      </span>
                    ) : null}
                  </>
                }
              />
              <Figure label="Interdependencia" value={formatPercent(data.interdependence, 0)} />
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
