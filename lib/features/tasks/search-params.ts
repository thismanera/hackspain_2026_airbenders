import { createLoader, parseAsString } from "nuqs/server";

// Shared between the server loader (app/tasks/page.tsx) and the client hook
// (useQueryStates in tasks-client.tsx) — one parser definition, one query key.
export const tasksSearchParams = {
  q: parseAsString.withDefault(""),
};

export const loadTasksSearchParams = createLoader(tasksSearchParams);
