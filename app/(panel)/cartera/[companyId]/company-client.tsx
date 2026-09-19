"use client";

import {
  CompanyDecisionTab,
  CompanyGroupTab,
  CompanyPredictionTab,
  CompanyRcaTab,
  CompanyScoreTab,
} from "@/components/grifo/company/company-file-tabs";
import { CompanyFacts } from "@/components/grifo/company/company-facts";
import { CompanyAvatar } from "@/components/grifo/company-avatar";
import { StatusDot, statusTextClass } from "@/components/grifo/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/core/utils";
import { useCompanyFile, useCompanyPageState } from "@/lib/features/portfolio/hooks";
import type { SheetTab } from "@/lib/features/portfolio/search-params";
import { ESTADO } from "@/lib/features/portfolio/vocabulary";

export function CompanyClient({ companyId, month }: { companyId: string; month: string }) {
  const { data } = useCompanyFile(companyId, month);
  const [{ pestana }, setPage] = useCompanyPageState();
  const { company, latest, peers } = data;

  const unknown = latest.estado === "sin_datos";
  const hasGroup = latest.group !== null && peers.length > 0;
  const hasForecast = latest.forecast !== null;
  const hasRca = Boolean(data.rca);
  const tab =
    (pestana === "grupo" && !hasGroup) ||
    (pestana === "prediccion" && !hasForecast) ||
    (pestana === "rca" && !hasRca)
      ? "decision"
      : pestana;

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => void setPage({ pestana: value as SheetTab }, { history: "replace" })}
      className="max-w-3xl gap-0"
    >
      <header className="flex flex-col gap-2 border-b pb-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <CompanyAvatar companyId={company.id} />
          <h1 className="font-mono text-lg font-semibold tracking-[-0.01em]">{company.id}</h1>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-medium",
              statusTextClass(latest.estado),
            )}
          >
            <StatusDot estado={latest.estado} />
            {ESTADO[latest.estado].label}
          </span>
          <CompanyFacts
            className="sm:ml-auto"
            score={latest.score}
            trend3m={latest.trend3m}
            confidence={latest.confidence}
            unknown={unknown}
          />
        </div>

        {unknown ? (
          <p className="text-muted-foreground text-xs text-pretty">
            No opinamos todavía: {latest.coverage.observedMonths} de 6 meses observados. El score no
            es una recomendación.
          </p>
        ) : null}

        <TabsList variant="line" className="h-9 gap-4 p-0">
          <TabsTrigger value="decision" className="px-0 text-sm after:!bottom-[-1px]">
            Decisión
          </TabsTrigger>
          <TabsTrigger value="score" className="px-0 text-sm after:!bottom-[-1px]">
            Score
          </TabsTrigger>
          {hasGroup ? (
            <TabsTrigger value="grupo" className="px-0 text-sm after:!bottom-[-1px]">
              Grupo
            </TabsTrigger>
          ) : null}
          {hasForecast ? (
            <TabsTrigger value="prediccion" className="px-0 text-sm after:!bottom-[-1px]">
              Predicción
            </TabsTrigger>
          ) : null}
          {hasRca ? (
            <TabsTrigger value="rca" className="px-0 text-sm after:!bottom-[-1px]">
              Revisión
            </TabsTrigger>
          ) : null}
        </TabsList>
      </header>

      <TabsContent value="decision" className="flex flex-col gap-4 pt-4">
        <CompanyDecisionTab file={data} />
      </TabsContent>
      <TabsContent value="score" className="flex flex-col gap-4 pt-4">
        <CompanyScoreTab file={data} />
      </TabsContent>
      {hasGroup ? (
        <TabsContent value="grupo" className="flex flex-col gap-4 pt-4">
          <CompanyGroupTab file={data} />
        </TabsContent>
      ) : null}
      {hasForecast ? (
        <TabsContent value="prediccion" className="flex flex-col gap-4 pt-4">
          <CompanyPredictionTab file={data} />
        </TabsContent>
      ) : null}
      {hasRca ? (
        <TabsContent value="rca" className="flex flex-col gap-4 pt-4">
          <CompanyRcaTab file={data} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
