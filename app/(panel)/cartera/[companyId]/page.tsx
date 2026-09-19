import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";

import { MonthSelect } from "@/components/grifo/month-select";
import { PageHeader } from "@/components/grifo/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getQueryClient } from "@/lib/core/react-query";
import { fetchCompanyFile, portfolioKeys } from "@/lib/features/portfolio/queries";
import { loadCompanySearchParams } from "@/lib/features/portfolio/search-params";
import { getCompanyFile } from "@/lib/features/portfolio/source";
import { getCompanyFileLive } from "@/lib/features/portfolio/live";

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

  // Una empresa que no existe merece un 404 de verdad, no un panel de error.
  const liveFile = await getCompanyFileLive(companyId, mes);
  if (!liveFile && !getCompanyFile(companyId, mes)) notFound();

  const queryClient = getQueryClient();
  void queryClient.prefetchQuery({
    queryKey: portfolioKeys.company(companyId, mes),
    queryFn: () =>
      fetchCompanyFile(companyId, mes, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  });

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
        <Suspense fallback={<CompanySkeleton />}>
          <CompanyClient companyId={companyId} month={mes} />
        </Suspense>
      </main>
    </HydrationBoundary>
  );
}

function CompanySkeleton() {
  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between gap-3 border-b pb-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-44" />
      </div>
      <div className="flex gap-4 border-b py-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-12" />
        <Skeleton className="h-5 w-12" />
      </div>
      <div className="mt-4 flex flex-col gap-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}
