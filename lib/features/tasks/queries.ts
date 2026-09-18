import type { TaskDTO } from "./types";

export function tasksQueryKey(q: string) {
  return ["tasks", q] as const;
}

/**
 * Shared by the client hook (relative URL) and the server prefetch in
 * app/tasks/page.tsx (absolute URL) so both hit the exact same endpoint and
 * queryKey — required for HydrationBoundary to hand off cleanly.
 */
export async function fetchTasks(
  params: { q?: string; baseUrl?: string } = {},
): Promise<TaskDTO[]> {
  const { q = "", baseUrl = "" } = params;
  const search = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await fetch(`${baseUrl}/api/tasks${search}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch tasks");
  const data: { tasks: TaskDTO[] } = await res.json();
  return data.tasks;
}
