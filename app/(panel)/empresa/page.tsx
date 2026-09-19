import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";

import { GlobalSearch } from "@/components/grifo/global-search";
import { MonthSelect } from "@/components/grifo/month-select";
import { PageHeader } from "@/components/grifo/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getQueryClient } from "@/lib/core/react-query";
import { portfolioKeys } from "@/lib/features/portfolio/queries";
import { getBenchmark, getCompanyFile } from "@/lib/features/portfolio/source";
import { loadPymeSearchParams } from "@/lib/features/portfolio/search-params";

import { EmpresaClient } from "./empresa-client";

export const metadata: Metadata = {
  description: "Lo que ve la empresa: su score, cómo se compara y qué tiene preaprobado.",
};

export default async function EmpresaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const state = await loadPymeSearchParams(searchParams);
  const file = state.empresa ? getCompanyFile(state.empresa, state.mes) : null;
  const benchmark = file ? getBenchmark(state.empresa, state.mes) : null;
  if (state.empresa && !file) redirect(`/empresa?mes=${state.mes}`);

  const queryClient = getQueryClient();
  if (file && benchmark) {
    queryClient.setQueryData(portfolioKeys.company(state.empresa, state.mes), file);
    queryClient.setQueryData(portfolioKeys.benchmark(state.empresa, state.mes), benchmark);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader
        crumbs={[{ label: "Cartera", href: "/cartera" }, { label: "Mi score" }]}
        actions={
          <Suspense fallback={<Skeleton className="h-8 w-56" />}>
            <GlobalSearch />
            <MonthSelect />
          </Suspense>
        }
      />
      <main className="flex flex-col gap-4 p-4 md:p-6">
        <Suspense fallback={<PageSkeleton />}>
          <EmpresaClient />
        </Suspense>
      </main>
    </HydrationBoundary>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-16 w-2/3" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
