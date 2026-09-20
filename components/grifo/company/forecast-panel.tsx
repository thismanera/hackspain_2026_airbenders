"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";

import {
  ForecastImpactFigures,
  ForecastImpactLine,
} from "@/components/grifo/company/forecast-impact";
import { Panel } from "@/components/grifo/panel";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMonthShort, formatMonthTick, formatScore } from "@/lib/features/portfolio/format";
import type { CompanyFileResponse } from "@/lib/features/portfolio/types";

const config = {
  score: { label: "Score", color: "var(--chart-3)" },
  pred: { label: "Previsto", color: "var(--chart-2)" },
  range: { label: "Rango p10–p90", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** Fronteras de banda de SOURCE §2.1. Cruzar una de estas líneas cambia el precio. */
const BAND_LINES = [
  { value: 75, label: "A" },
  { value: 60, label: "B" },
  { value: 45, label: "C" },
];

const HISTORY_MONTHS = 12;

function tick(value: string): string {
  return value.startsWith("+") ? value : formatMonthTick(value);
}

/**
 * Dónde estará el score si nada cambia: el último año observado y dos puntos
 * previstos a 3 y 6 meses con su rango. Debajo, lo que eso vale en dinero.
 */
export function ForecastPanel({
  file,
  /** Dentro de otro contenedor: sin tarjeta propia, porque no se anidan. */
  inset = false,
}: {
  file: CompanyFileResponse;
  inset?: boolean;
}) {
  const { latest, history } = file;
  const forecast = latest.forecast;

  if (!forecast) {
    const empty = (
      <p className="text-muted-foreground py-8 text-center text-sm text-pretty">
        Todavía no hay previsión a 3 y 6 meses para esta empresa. Cuando exista, aparecerá aquí con
        su rango de incertidumbre.
      </p>
    );
    return inset ? empty : <Panel title="Escenario a 3 y 6 meses">{empty}</Panel>;
  }

  const observed = history.filter((month) => month.coverage.observedMonths > 0);
  const recent = (observed.length > 0 ? observed : history).slice(-HISTORY_MONTHS);
  const data = [
    ...recent.map((month, index) => ({
      month: month.month,
      score: Math.round(month.score * 10) / 10,
      // El tramo previsto arranca del último punto real para que la línea no salte.
      pred: index === recent.length - 1 ? Math.round(month.score * 10) / 10 : null,
      range: index === recent.length - 1 ? [month.score, month.score] : null,
    })),
    {
      month: "+3 m",
      score: null,
      pred: forecast.scoreSoloPred3m,
      range: [forecast.p10Solo3m, forecast.p90Solo3m],
    },
    {
      month: "+6 m",
      score: null,
      pred: forecast.scoreSoloPred6m,
      range: [forecast.p10Solo6m, forecast.p90Solo6m],
    },
  ];

  const body = (
    <>
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <ComposedChart data={data} margin={{ top: 8, right: 28, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={16}
            tickFormatter={(value) => tick(String(value))}
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
                labelFormatter={(value) =>
                  String(value).startsWith("+")
                    ? `Dentro de ${String(value).slice(1)}eses`
                    : formatMonthShort(String(value))
                }
                formatter={(value, name, item) => (
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {config[item.dataKey as keyof typeof config]?.label ?? name}
                    </span>
                    <span className="text-foreground font-mono font-medium tabular-nums">
                      {Array.isArray(value)
                        ? `${formatScore(Number(value[0]))}–${formatScore(Number(value[1]))}`
                        : formatScore(Number(value))}
                    </span>
                  </div>
                )}
                indicator="line"
              />
            }
          />
          <Area
            dataKey="range"
            type="monotone"
            stroke="none"
            fill="var(--color-range)"
            fillOpacity={0.12}
            isAnimationActive={false}
            connectNulls
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
          <Line
            dataKey="pred"
            type="monotone"
            stroke="var(--color-pred)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3 }}
            isAnimationActive={false}
            connectNulls
          />
        </ComposedChart>
      </ChartContainer>

      <p className="text-muted-foreground mt-2 text-xs text-pretty">
        Hoy {formatScore(latest.score)}; en 3 meses {formatScore(forecast.scoreSoloPred3m)} (rango{" "}
        {formatScore(forecast.p10Solo3m)}–{formatScore(forecast.p90Solo3m)}); en 6 meses{" "}
        {formatScore(forecast.scoreSoloPred6m)} (rango {formatScore(forecast.p10Solo6m)}–
        {formatScore(forecast.p90Solo6m)}).
      </p>

      {forecast.impact ? (
        <>
          <div className="mt-4 border-t pt-4">
            <ForecastImpactFigures impact={forecast.impact} />
          </div>
          <ForecastImpactLine forecast={forecast} showAction className="mt-4 border-t pt-4" />
        </>
      ) : null}
    </>
  );

  return inset ? (
    body
  ) : (
    <Panel
      title="Escenario a 3 y 6 meses"
      description="Si nada cambia en la operativa: tendencia amortiguada de los últimos seis meses, con su rango. Es una extrapolación heurística, no una predicción calibrada."
      aside={
        <span className="text-muted-foreground text-xs">
          {forecast.metodoSolo === "desconectado" ? "Modo sombra" : "Aplicada a la decisión"}
        </span>
      }
    >
      {body}
    </Panel>
  );
}
