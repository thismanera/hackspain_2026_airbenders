import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";

import { getQueryClient } from "@/lib/core/react-query";
import { fetchTasks, tasksQueryKey } from "@/lib/features/tasks/queries";
import { loadTasksSearchParams } from "@/lib/features/tasks/search-params";

import { TasksClient } from "./tasks-client";

// Reference implementation of two patterns at once:
// - TanStack Query advanced SSR: https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
// - nuqs server-side searchParams parsing + Suspense: https://nuqs.dev/docs/server-side
export default async function TasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q } = await loadTasksSearchParams(searchParams);

  const queryClient = getQueryClient();
  void queryClient.prefetchQuery({
    queryKey: tasksQueryKey(q),
    queryFn: () =>
      fetchTasks({ q, baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000" }),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <main className="mx-auto max-w-xl p-8">
        <h1 className="mb-4 text-2xl font-semibold">Tasks</h1>
        <Suspense fallback={<TasksListSkeleton />}>
          <TasksClient />
        </Suspense>
      </main>
    </HydrationBoundary>
  );
}

function TasksListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="bg-muted h-9 animate-pulse rounded-md" />
      <div className="bg-muted h-9 animate-pulse rounded-md" />
      <div className="bg-muted h-9 animate-pulse rounded-md" />
    </div>
  );
}
