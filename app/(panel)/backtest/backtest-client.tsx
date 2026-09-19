"use client";

import { ArrowUpDown, Clock, FlaskConical, Repeat, ShieldAlert, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Panel } from "@/components/grifo/panel";
import { PageIntro, StatCard } from "@/components/grifo/stat-card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  formatDecimal,
  formatEurosCompact,
  formatMonthLong,
  formatMonthShort,
  formatMonthTick,
  formatPercent,
} from "@/lib/features/portfolio/format";
import { useBacktest, useMonth } from "@/lib/features/portfolio/hooks";
import type { EngineMetrics, EngineScoreMetrics } from "@/lib/features/portfolio/types";

const timelineConfig = {
  anticipated: { label: "Cierres avisados", color: "var(--status-healthy)" },
  blind: { label: "Cierres sin aviso", color: "var(--status-risk)" },
} satisfies ChartConfig;

const leadConfig = {
  count: { label: "Cierres", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function BacktestClient() {
  const [{ mes }] = useMonth();
  const { data } = useBacktest(mes);

  const hitRate = data.closes > 0 ? data.anticipated / data.closes : null;
  const criticalRate = data.criticalAlerts > 0 ? data.criticalFollowed / data.criticalAlerts : null;
  const timeline = data.timeline.map((point) => ({
    month: point.month,
    anticipated: point.anticipated,
    blind: point.closes - point.anticipated,
    alerts: point.alerts,
  }));
  const maxLead = Math.max(0, ...data.leadTimes.map((entry) => entry.months));
  const leadHistogram = Array.from({ length: maxLead }, (_, index) => {
    const months = index + 1;
    return {
      months,
      label: `${months} m`,
      count: data.leadTimes.find((entry) => entry.months === months)?.count ?? 0,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        title="¿Avisó antes de cerrar, y cuánto antes?"
        description={
          <>
            {data.companies} empresas de la cartera hasta {formatMonthLong(data.cutoff)}; cambiar el
            mes mueve la fecha de corte.
          </>
        }
      />

      {data.engine ? <EnginePanel engine={data.engine} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={XCircle}
          label="Cierres de línea"
          value={data.closes}
          hint={`${formatMonthShort(data.months[0])} – ${formatMonthShort(data.cutoff)}, con línea viva el mes anterior`}
        />
        <StatCard
          icon={ShieldAlert}
          label="Avisados antes"
          value={hitRate === null ? "—" : formatPercent(hitRate, 0)}
          tone="healthy"
          hint={`${data.anticipated} de ${data.closes} con alerta abierta al cerrar`}
        />
        <StatCard
          icon={Clock}
          label="Anticipación mediana"
          value={data.medianLead ?? "—"}
          unit={data.medianLead === null ? undefined : data.medianLead === 1 ? "mes" : "meses"}
          hint="De la primera alerta al cierre"
        />
        <StatCard
          icon={FlaskConical}
          label="Críticas seguidas"
          value={criticalRate === null ? "—" : formatPercent(criticalRate, 0)}
          hint={
            data.criticalAlerts > 0
              ? `${data.criticalFollowed} de ${data.criticalAlerts} acabaron en reducir o cerrar en 3 meses`
              : "Sin críticas con 3 meses por delante"
          }
        />
        <StatCard
          icon={ArrowUpDown}
          label="Cambios de banda por empresa"
          value={formatDecimal(data.bandChangesPerYear)}
          unit="al año"
          hint="Menos es una decisión más estable"
        />
        <StatCard
          icon={Repeat}
          label="Ida y vuelta"
          value={data.flipFlops}
          unit={`de ${data.companies}`}
          hint="La acción cambió y volvió al mes siguiente"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          title="Cierres por mes"
          description="Con o sin alerta abierta el mes anterior."
          className="lg:col-span-3"
        >
          <ChartContainer config={timelineConfig} className="aspect-auto h-56 w-full">
            <BarChart
              data={timeline}
              margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
              barCategoryGap="28%"
            >
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
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={28}
              />
              <ChartTooltip
                cursor={{ fill: "var(--muted)" }}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => formatMonthShort(String(value))}
                    indicator="dot"
                  />
                }
              />
              <Bar
                dataKey="blind"
                stackId="closes"
                fill="var(--color-blind)"
                isAnimationActive={false}
              />
              <Bar
                dataKey="anticipated"
                stackId="closes"
                fill="var(--color-anticipated)"
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartContainer>
          <ul className="mt-2 flex flex-wrap gap-4 text-xs">
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="bg-status-healthy size-2.5 rounded-sm" />
              Con alerta previa
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="bg-status-risk size-2.5 rounded-sm" />
              Sin aviso
            </li>
          </ul>
        </Panel>

        <Panel
          title="Cuánto antes"
          description="Meses de la primera alerta al cierre."
          className="lg:col-span-2"
        >
          {leadHistogram.length === 0 ? (
            <p className="text-muted-foreground text-sm">Ningún cierre avisado en el periodo.</p>
          ) : (
            <ChartContainer config={leadConfig} className="aspect-auto h-56 w-full">
              <BarChart
                data={leadHistogram}
                margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
                barCategoryGap="30%"
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={4}
                  width={28}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--muted)" }}
                  content={<ChartTooltipContent indicator="dot" />}
                />
                <Bar
                  dataKey="count"
                  fill="var(--color-count)"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>
          )}
        </Panel>
      </div>
    </div>
  );
}

function ratio(value: number | null): string {
  return value === null ? "—" : formatPercent(value, 0);
}

function decimal(value: number | null): string {
  return value === null ? "—" : formatDecimal(value);
}

function ScoreMetricsRow({ label, metrics }: { label: string; metrics: EngineScoreMetrics }) {
  return (
    <tr className="border-border/60 border-t">
      <th scope="row" className="py-2 pr-3 text-left font-medium">
        {label}
      </th>
      <td className="py-2 pr-3 text-right tabular-nums">{decimal(metrics.spearman)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {decimal(metrics.stressAuc)}
        {metrics.stressAucCi95 ? (
          <span className="text-muted-foreground ml-1 text-xs">
            [{formatDecimal(metrics.stressAucCi95[0])}–{formatDecimal(metrics.stressAucCi95[1])}]
          </span>
        ) : null}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">{ratio(metrics.deterioro.recall)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {ratio(metrics.deterioro.falseAlarmRate)}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {metrics.deterioro.leadMedian === null
          ? "—"
          : `${formatDecimal(metrics.deterioro.leadMedian)} m`}
      </td>
      <td className="py-2 text-right tabular-nums">{ratio(metrics.recuperacion.recall)}</td>
    </tr>
  );
}

/** Métricas persistidas por el pipeline (`ScoreRun.metrics`): validación hold-out del motor. */
function EnginePanel({ engine }: { engine: EngineMetrics }) {
  return (
    <Panel
      title="Validación del motor"
      description={`${engine.validationCompanies} empresas de validación, ${formatMonthShort(engine.window[0])} – ${formatMonthShort(engine.window[1])}. Calculado por el pipeline, no por el panel.`}
      bodyClassName="flex flex-col gap-4"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr>
              <th scope="col" className="pr-3 pb-1 text-left font-medium">
                Score
              </th>
              <th scope="col" className="pr-3 pb-1 text-right font-medium">
                Spearman
              </th>
              <th scope="col" className="pr-3 pb-1 text-right font-medium">
                AUC estrés
              </th>
              <th scope="col" className="pr-3 pb-1 text-right font-medium">
                Deterioros avisados
              </th>
              <th scope="col" className="pr-3 pb-1 text-right font-medium">
                Falsas alarmas
              </th>
              <th scope="col" className="pr-3 pb-1 text-right font-medium">
                Anticipación
              </th>
              <th scope="col" className="pb-1 text-right font-medium">
                Recuperaciones avisadas
              </th>
            </tr>
          </thead>
          <tbody>
            <ScoreMetricsRow label="Autónomo" metrics={engine.scoreSolo} />
            <ScoreMetricsRow label="Con grupo" metrics={engine.scoreGrupo} />
          </tbody>
        </table>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground text-xs">Cierres del motor</dt>
          <dd className="tabular-nums">
            {engine.decision.closes}
            <span className="text-muted-foreground ml-1 text-xs">
              {engine.decision.falseCloses} falsos
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Anticipación al cierre</dt>
          <dd className="tabular-nums">
            {engine.decision.closeLeadMedian === null
              ? "—"
              : `${formatDecimal(engine.decision.closeLeadMedian)} meses`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Exposición evitada</dt>
          <dd className="tabular-nums">{formatEurosCompact(engine.decision.avoidedExposure)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Ingresos simulados</dt>
          <dd className="tabular-nums">
            {formatEurosCompact(engine.decision.simulatedRevenue)}
            <span className="text-muted-foreground ml-1 text-xs">
              oscilación {formatDecimal(engine.decision.oscillation)}
            </span>
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
