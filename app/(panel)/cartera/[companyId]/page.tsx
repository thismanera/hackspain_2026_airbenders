import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";

import { EngineUnavailable } from "@/components/grifo/engine-unavailable";
import { MonthSelect } from "@/components/grifo/month-select";
import { PageHeader } from "@/components/grifo/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getQueryClient } from "@/lib/core/react-query";
import { withEngine } from "@/lib/features/portfolio/prefetch";
import { portfolioKeys } from "@/lib/features/portfolio/queries";
import { loadCompanySearchParams } from "@/lib/features/portfolio/search-params";
import { getCompanyFile } from "@/lib/features/portfolio/source";

import { CompanyClient } from "./company-client";

type Props = {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<SearchParams>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { companyId } = await params;
  return {
    description: `Decisión de crédito y score de ${companyId}.`,
  };
}

export default async function CompanyPage({ params, searchParams }: Props) {
  const [{ companyId }, { mes }] = await Promise.all([
    params,
    loadCompanySearchParams(searchParams),
  ]);

  const result = await withEngine(() => getCompanyFile(companyId, mes));
  // Una empresa que no existe merece un 404 de verdad, no un panel de error.
  if (result.status === "ok" && !result.data) notFound();

  const queryClient = getQueryClient();
  if (result.status === "ok" && result.data) {
    queryClient.setQueryData(portfolioKeys.company(companyId, mes), result.data);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader
        crumbs={[{ label: "Cartera", href: `/cartera?mes=${mes}` }, { label: companyId }]}
        actions={
          <Suspense fallback={<Skeleton className="h-8 w-36" />}>
            <MonthSelect />
          </Suspense>
        }
      />

      <main className="p-4 md:p-6">
        {result.status === "unavailable" ? (
          <EngineUnavailable />
        ) : (
          <Suspense fallback={<CompanySkeleton />}>
            <CompanyClient companyId={companyId} month={mes} />
          </Suspense>
        )}
      </main>
    </HydrationBoundary>
  );
}

function CompanySkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-12 w-40" />
      </div>
      <Skeleton className="h-28 rounded-lg" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-96 rounded-lg" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-56 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
