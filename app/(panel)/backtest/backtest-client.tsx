"use client";

import { Clock, FlaskConical, ShieldAlert, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Figure, Panel } from "@/components/grifo/panel";
import { PageIntro, StatCard } from "@/components/grifo/stat-card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  formatDecimal,
  formatMonthLong,
  formatMonthShort,
  formatMonthTick,
  formatPercent,
} from "@/lib/features/portfolio/format";
import { useBacktest, useMonth } from "@/lib/features/portfolio/hooks";

const timelineConfig = {
  anticipated: { label: "Cierres avisados", color: "var(--status-healthy)" },
  blind: { label: "Cierres sin aviso", color: "var(--status-risk)" },
} satisfies ChartConfig;

const leadConfig = {
  count: { label: "Cierres", color: "var(--foreground)" },
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
        eyebrow="Backtest"
        title="¿Avisó antes de cerrar, y cuánto antes?"
        description={
          <>
            Se recorre la historia de las {data.companies} empresas hasta{" "}
            {formatMonthLong(data.cutoff)}: cada vez que una línea viva se cierra, se mira si había
            una alerta abierta y desde cuándo. Es una medida sobre el dataset de demostración, no
            sobre cartera real.
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={XCircle}
          label="Cierres de línea"
          value={data.closes}
          hint={`Líneas vivas que pasaron a cerrar, ${formatMonthShort(data.months[0])} – ${formatMonthShort(data.cutoff)}`}
        />
        <StatCard
          icon={ShieldAlert}
          label="Avisados antes"
          value={hitRate === null ? "—" : formatPercent(hitRate, 0)}
          tone="healthy"
          hint={`${data.anticipated} de ${data.closes} cierres tenían una alerta abierta el mes anterior`}
        />
        <StatCard
          icon={Clock}
          label="Anticipación mediana"
          value={data.medianLead ?? "—"}
          unit={data.medianLead === null ? undefined : data.medianLead === 1 ? "mes" : "meses"}
          hint="Desde que aparece la primera alerta hasta que la línea se cierra"
        />
        <StatCard
          icon={FlaskConical}
          label="Críticas seguidas de acción"
          value={criticalRate === null ? "—" : formatPercent(criticalRate, 0)}
          hint={
            data.criticalAlerts > 0
              ? `${data.criticalFollowed} de ${data.criticalAlerts} alertas críticas con línea viva acabaron en reducir o cerrar en 3 meses`
              : "Ninguna alerta crítica con línea viva y tres meses de seguimiento"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          title="Cierres por mes"
          description="Cada cierre, según hubiera o no una alerta abierta el mes anterior."
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
          description="Meses entre la primera alerta y el cierre, para los cierres avisados."
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

        <Panel
          title="Estabilidad de la decisión"
          description="Una línea que cambia de banda cada mes no sirve a nadie, aunque acierte."
          className="lg:col-span-2"
        >
          <dl className="grid grid-cols-2 gap-4">
            <Figure
              label="Cambios de banda por empresa y año"
              value={formatDecimal(data.bandChangesPerYear)}
              hint="Contando solo meses con datos"
            />
            <Figure
              label="Empresas con ida y vuelta"
              value={data.flipFlops}
              hint={`De ${data.companies}: la acción cambió y volvió al mes siguiente`}
            />
          </dl>
        </Panel>

        <Panel
          title="Cómo se mide"
          description="Sin trampas: la misma regla para todas las empresas."
          className="lg:col-span-3"
        >
          <ol className="flex flex-col gap-2 text-sm text-pretty">
            {[
              "Un cierre cuenta si la línea estaba viva el mes anterior. Cerrar lo que ya estaba cerrado no es una decisión.",
              "Se considera avisado si al cerrar había alguna alerta abierta cuyo inicio es anterior al mes del cierre. La anticipación es la distancia hasta la más antigua.",
              "Una alerta crítica se da por seguida si en los tres meses siguientes la acción pasó a reducir o cerrar. Solo se mide donde hay tres meses por delante.",
              "Cambiar el mes de arriba mueve la fecha de corte: el backtest solo mira hacia atrás desde ahí.",
            ].map((line, index) => (
              <li key={line} className="flex gap-2.5">
                <span className="text-muted-foreground w-4 shrink-0 text-right text-xs tabular-nums">
                  {index + 1}
                </span>
                {line}
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
