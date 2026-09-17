import { defaultShouldDehydrateQuery, isServer, QueryClient } from "@tanstack/react-query";
import { cache } from "react";

/**
 * Shared defaults + SSR wiring for TanStack Query, following the advanced SSR
 * guide: https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
 * Server: one QueryClient per request (React `cache`). Browser: one singleton
 * that survives re-renders, created lazily so it isn't allocated during SSR.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 10, // 10 minutes
        retry: (failureCount, error) => {
          if (error instanceof Error && error.message.includes("4")) {
            return false;
          }
          return failureCount < 2;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        refetchOnWindowFocus: false,
        refetchOnMount: true,
        refetchOnReconnect: "always",
      },
      mutations: {
        retry: 1,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      },
      dehydrate: {
        // Include pending queries in dehydration so streaming/Suspense can hydrate them.
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
        // Next.js already redacts server errors with digests; don't double-redact,
        // or Next loses the signal it uses to detect dynamic pages.
        shouldRedactErrors: () => false,
      },
    },
  });
}

const getRequestQueryClient = cache(() => makeQueryClient());

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (isServer) {
    return getRequestQueryClient();
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
