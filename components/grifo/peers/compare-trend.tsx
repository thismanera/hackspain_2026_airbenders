"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Panel } from "@/components/grifo/panel";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMonthShort, formatMonthTick } from "@/lib/features/portfolio/format";
import type { CompanyFileResponse } from "@/lib/features/portfolio/types";

import { SERIES } from "./series";

/** Score mes a mes de las empresas comparadas, una línea por empresa. */
export function CompareTrend({ files, month }: { files: CompanyFileResponse[]; month: string }) {
  const months = files.length ? files[0].months : [];
  const chartConfig = Object.fromEntries(
    files.map((file, index) => [file.company.id, { label: file.company.id, color: SERIES[index] }]),
  ) satisfies ChartConfig;
  const chartData = months.map((entryMonth, index) => {
    return Object.fromEntries([
      ["month", entryMonth],
      ...files.map((file) => {
        const entry = file.history[index];
        return [file.company.id, entry && entry.coverage.observedMonths > 0 ? entry.score : null];
      }),
    ]);
  });

  return (
    <Panel
      title="Score en el tiempo"
      description={`Desde que hay datos de cada una hasta ${formatMonthShort(month)}.`}
    >
      <ChartContainer config={chartConfig} className="aspect-auto h-48 w-full">
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={formatMonthTick}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatMonthShort(String(value))}
                indicator="line"
              />
            }
          />
          {files.map((file) => (
            <Line
              key={file.company.id}
              dataKey={file.company.id}
              type="monotone"
              stroke={`var(--color-${file.company.id})`}
              strokeWidth={1.75}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
      <ul className="mt-2 flex flex-wrap gap-4 text-xs">
        {files.map((file, index) => (
          <li key={file.company.id} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-0.5 w-4 rounded-full"
              style={{ background: SERIES[index] }}
            />
            <span className="font-mono">{file.company.id}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
