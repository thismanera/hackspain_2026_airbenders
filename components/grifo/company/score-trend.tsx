"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { Panel } from "@/components/grifo/panel";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMonthShort, formatMonthTick } from "@/lib/features/portfolio/format";
import type { MonthScore } from "@/lib/features/portfolio/types";
import { DIRECCION, NATURALEZA } from "@/lib/features/portfolio/vocabulary";

const config = {
  score: { label: "Score", color: "var(--chart-3)" },
} satisfies ChartConfig;

/** Fronteras de banda de SOURCE §2.1. Cruzar una de estas líneas cambia el precio. */
const BAND_LINES = [
  { value: 75, label: "A" },
  { value: 60, label: "B" },
  { value: 45, label: "C" },
];

export function ScoreTrend({ history }: { history: MonthScore[] }) {
  // Antes del primer mes con movimientos el motor rellena nota 50 con confianza 0
  // (SOURCE §1.0). Pintar ese tramo dibujaría dos años de estabilidad inventada en
  // una empresa de la que no sabemos nada, así que la serie empieza donde empiezan
  // los datos.
  const firstObserved = history.findIndex((month) => month.coverage.observedMonths > 0);
  const observed = firstObserved === -1 ? history : history.slice(firstObserved);

  const data = observed.map((month) => ({
    month: month.month,
    score: Math.round(month.score * 10) / 10,
  }));

  const latest = history[history.length - 1];

  // Con uno o dos puntos no hay serie: una rejilla vacía con un punto suelto
  // aparenta un fallo de carga, y además sugiere una tendencia que no existe.
  if (observed.length < 3) {
    return (
      <Panel title="Evolución del score" description="Hace falta histórico para dibujar una serie.">
        <p className="text-muted-foreground py-8 text-center text-sm text-pretty">
          Solo {observed.length} {observed.length === 1 ? "mes observado" : "meses observados"}. La
          serie aparecerá cuando haya al menos tres.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Evolución del score"
      description="Las líneas horizontales son las fronteras de banda: cruzarlas cambia el importe y el precio."
    >
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <LineChart data={data} margin={{ top: 8, right: 28, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={16}
            tickFormatter={formatMonthTick}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            width={32}
          />
          {BAND_LINES.map((band) => (
            <ReferenceLine
              key={band.value}
              y={band.value}
              stroke="var(--border)"
              strokeDasharray="4 4"
              label={{
                value: band.label,
                position: "right",
                fill: "var(--muted-foreground)",
                fontSize: 11,
              }}
            />
          ))}
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatMonthShort(String(value))}
                indicator="line"
              />
            }
          />
          <Line
            dataKey="score"
            type="monotone"
            stroke="var(--color-score)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>

      <p className="text-muted-foreground mt-2 text-xs text-pretty">
        {observed.length} {observed.length === 1 ? "mes valorado" : "meses valorados"}, hasta{" "}
        {formatMonthShort(latest.month)}. Tendencia{" "}
        <span className="text-foreground">{DIRECCION[latest.direction].label.toLowerCase()}</span> de
        naturaleza{" "}
        <span className="text-foreground">{NATURALEZA[latest.nature].label.toLowerCase()}</span>:{" "}
        {NATURALEZA[latest.nature].description}
      </p>
    </Panel>
  );
}
