"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { Panel } from "@/components/grifo/panel";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useScoringCompany } from "@/lib/features/portfolio/hooks";

const config = {
  solo: { label: "Solo", color: "var(--chart-1)" },
  grupo: { label: "Grupo", color: "var(--chart-2)" },
  soloPred: { label: "Solo previsto", color: "var(--chart-1)" },
  grupoPred: { label: "Grupo previsto", color: "var(--chart-2)" },
} satisfies ChartConfig;

function shortMonth(month: string): string {
  return month.slice(2).replace("-", "/");
}

function methodLabel(method: string): string {
  return method === "desconectado" ? "modo sombra" : "aplicado a decisión";
}

export function ForecastPanel({ companyId, month }: { companyId: string; month: string }) {
  const query = useScoringCompany(companyId);
  if (query.isLoading) {
    return (
      <Panel title="Forecast" description="Cargando la previsión del run compatible…">
        <p className="text-muted-foreground py-8 text-center text-sm">Preparando proyección.</p>
      </Panel>
    );
  }
  if (query.isError || !query.data?.latest.forecast) {
    return (
      <Panel
        title="Forecast"
        description="La previsión se calcula aunque no esté conectada a la decisión."
      >
        <p className="text-muted-foreground py-8 text-center text-sm">
          No hay un run de forecast compatible disponible.
        </p>
      </Panel>
    );
  }
  const latest = query.data.history.find((point) => point.month === month) ?? query.data.latest;
  const forecast = latest.forecast;
  if (forecast === null) {
    return (
      <Panel title="Forecast">
        <p className="text-muted-foreground py-8 text-center text-sm">
          No hay una previsión compatible.
        </p>
      </Panel>
    );
  }
  const historical = query.data.history.filter((point) => point.month <= latest.month).slice(-12);
  const data = [
    ...historical.map((point) => ({
      month: point.month,
      solo: point.scoreSolo,
      grupo: point.scoreGrupo,
    })),
    {
      month: `${latest.month}+3`,
      soloPred: forecast.horizontes[3].scoreSoloPred,
      grupoPred: forecast.horizontes[3].scoreGrupoPred,
    },
    {
      month: `${latest.month}+6`,
      soloPred: forecast.horizontes[6].scoreSoloPred,
      grupoPred: forecast.horizontes[6].scoreGrupoPred,
    },
  ];
  const topSolo = forecast.driversSolo[0];
  const topGrupo = forecast.driversGrupo[0];

  return (
    <Panel
      title="Forecast dual"
      description="La serie usa la nota autónoma y la nota dentro del holding en la misma escala 0–100."
    >
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <LineChart data={data} margin={{ top: 8, right: 28, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={18}
            tickFormatter={(value) => shortMonth(String(value))}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 45, 60, 75, 100]}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            width={32}
          />
          {[45, 60, 75].map((value) => (
            <ReferenceLine key={value} y={value} stroke="var(--border)" strokeDasharray="4 4" />
          ))}
          <ChartTooltip
            content={
              <ChartTooltipContent labelFormatter={(value) => String(value)} indicator="line" />
            }
          />
          <Line
            dataKey="solo"
            type="monotone"
            stroke="var(--color-solo)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            dataKey="grupo"
            type="monotone"
            stroke="var(--color-grupo)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            dataKey="soloPred"
            type="monotone"
            stroke="var(--color-soloPred)"
            strokeDasharray="5 4"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            dataKey="grupoPred"
            type="monotone"
            stroke="var(--color-grupoPred)"
            strokeDasharray="5 4"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
            connectNulls
          />
        </LineChart>
      </ChartContainer>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <ForecastMetric
          label="Solo"
          current={latest.scoreSolo}
          forecast={forecast.horizontes[3].scoreSoloPred}
          interval={[forecast.horizontes[3].p10Solo, forecast.horizontes[3].p90Solo]}
          forecast6={forecast.horizontes[6].scoreSoloPred}
          interval6={[forecast.horizontes[6].p10Solo, forecast.horizontes[6].p90Solo]}
          method={forecast.metodoSolo}
        />
        <ForecastMetric
          label="Grupo"
          current={latest.scoreGrupo}
          forecast={forecast.horizontes[3].scoreGrupoPred}
          interval={[forecast.horizontes[3].p10Grupo, forecast.horizontes[3].p90Grupo]}
          forecast6={forecast.horizontes[6].scoreGrupoPred}
          interval6={[forecast.horizontes[6].p10Grupo, forecast.horizontes[6].p90Grupo]}
          method={forecast.metodoGrupo}
        />
      </div>
      <div className="text-muted-foreground mt-3 grid gap-1 text-xs sm:grid-cols-2">
        <p>
          Driver autónomo:{" "}
          <span className="text-foreground">
            {topSolo
              ? `${topSolo.id} (${topSolo.deltaAportacion >= 0 ? "+" : ""}${topSolo.deltaAportacion.toFixed(1)} pt)`
              : "sin comparación"}
          </span>
        </p>
        <p>
          Driver con holding:{" "}
          <span className="text-foreground">
            {topGrupo
              ? `${topGrupo.id} (${topGrupo.deltaAportacion >= 0 ? "+" : ""}${topGrupo.deltaAportacion.toFixed(1)} pt)`
              : "sin comparación"}
          </span>
        </p>
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <p className="rounded-lg border p-2">
          <span className="font-medium">Revisión interna EWI:</span>{" "}
          {latest.evaluacionEwi.revisionStage2Candidata
            ? "candidata (2 o más señales)"
            : "sin candidata"}
        </p>
        <p className="rounded-lg border p-2">
          <span className="font-medium">Holding:</span>{" "}
          {latest.requiereAvalMatriz
            ? "requiere aval solidario"
            : latest.alertaPignoracionCaja
              ? "alerta de pignoración de caja"
              : "sin cláusula adicional"}
        </p>
        {latest.cobertura.hardcoreRevolving ? (
          <p className="rounded-lg border p-2 text-pretty sm:col-span-2">
            <span className="font-medium">Hardcore revolving:</span> la línea se dispone durante al
            menos tres meses sin amortización observada.
          </p>
        ) : null}
        {latest.recomendacionEmbat ? (
          <p className="rounded-lg border p-2 text-pretty sm:col-span-2">
            <span className="font-medium">Oportunidad Embat:</span> {latest.recomendacionEmbat}
          </p>
        ) : null}
      </div>
      <p className="text-muted-foreground mt-3 text-xs text-pretty">
        La probabilidad mostrada por el motor mide estrés operativo observado, no una probabilidad
        contractual de impago.
      </p>
    </Panel>
  );
}

function ForecastMetric({
  label,
  current,
  forecast,
  interval,
  forecast6,
  interval6,
  method,
}: {
  label: string;
  current: number;
  forecast: number;
  interval: [number, number];
  forecast6: number;
  interval6: [number, number];
  method: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">{methodLabel(method)}</span>
      </div>
      <p className="mt-1 tabular-nums">
        <span className="text-lg font-semibold">{Math.round(current)}</span>
        <span className="text-muted-foreground"> → </span>
        <span className="text-lg font-semibold">{Math.round(forecast)}</span>
      </p>
      <p className="text-muted-foreground text-xs">
        3 meses · intervalo {Math.round(interval[0])}–{Math.round(interval[1])}
      </p>
      <p className="text-muted-foreground text-xs">
        6 meses · {Math.round(forecast6)} · intervalo {Math.round(interval6[0])}–
        {Math.round(interval6[1])}
      </p>
    </div>
  );
}
