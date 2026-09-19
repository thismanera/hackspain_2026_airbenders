"use client";

import { ArrowUpRight, Orbit } from "lucide-react";
import Link from "next/link";

import {
  CompanyDecisionTab,
  CompanyGroupTab,
  CompanyScoreTab,
} from "@/components/grifo/company/company-file-tabs";
import { CompanyAvatar } from "@/components/grifo/company-avatar";
import { CompanyFacts } from "@/components/grifo/company/company-facts";
import { StatusDot, statusTextClass } from "@/components/grifo/status-badge";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/core/utils";
import { useCompanyFile } from "@/lib/features/portfolio/hooks";
import type { SheetTab } from "@/lib/features/portfolio/search-params";
import { ESTADO } from "@/lib/features/portfolio/vocabulary";

export function CompanySheet({
  companyId,
  month,
  tab,
  onTabChange,
  onOpenCompany,
  onOpenGroup,
}: {
  companyId: string;
  month: string;
  tab: SheetTab;
  onTabChange: (tab: SheetTab) => void;
  onOpenCompany: (companyId: string) => void;
  onOpenGroup: (groupId: string) => void;
}) {
  const { data } = useCompanyFile(companyId, month);
  const { company, latest, peers } = data;
  const hasGroup = latest.group !== null && peers.length > 0;
  const unknown = latest.estado === "sin_datos";

  return (
    <Tabs
      value={hasGroup || tab !== "grupo" ? tab : "decision"}
      onValueChange={(value) => onTabChange(value as SheetTab)}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <header className="flex flex-col gap-2 border-b px-5 pt-4 pb-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pr-8">
          <CompanyAvatar companyId={company.id} />
          <SheetTitle className="font-mono text-lg font-semibold tracking-[-0.01em]">
            {company.id}
          </SheetTitle>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-medium",
              statusTextClass(latest.estado),
            )}
          >
            <StatusDot estado={latest.estado} />
            {ESTADO[latest.estado].label}
          </span>
          <SheetDescription className="text-xs">
            <CompanyFacts
              score={latest.score}
              trend3m={latest.trend3m}
              confidence={latest.confidence}
              unknown={unknown}
            />
          </SheetDescription>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href={`/pares?empresas=${company.id}&mes=${month}`} />}
              className="px-2 sm:px-3"
            >
              <Orbit aria-hidden />
              <span className="hidden sm:inline">Comparar</span>
            </Button>
            <Button
              aria-label="Abrir ficha completa"
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href={`/cartera/${company.id}?mes=${month}&pestana=${tab}`} />}
              className="px-2 sm:px-3"
            >
              <span className="hidden sm:inline">Abrir ficha</span>
              <ArrowUpRight aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      <TabsList variant="line" className="h-9 gap-4 p-0 px-5">
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
      </TabsList>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <TabsContent value="decision" className="flex flex-col gap-4">
          <CompanyDecisionTab file={data} />
        </TabsContent>

        <TabsContent value="score" className="flex flex-col gap-4">
          <CompanyScoreTab file={data} />
        </TabsContent>

        {hasGroup ? (
          <TabsContent value="grupo" className="flex flex-col gap-4">
            <CompanyGroupTab
              file={data}
              onOpenCompany={onOpenCompany}
              onOpenGroup={onOpenGroup}
            />
          </TabsContent>
        ) : null}
      </div>
    </Tabs>
  );
}
