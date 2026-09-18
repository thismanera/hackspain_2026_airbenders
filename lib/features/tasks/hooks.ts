"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/toast";

import { fetchTasks, tasksQueryKey } from "./queries";
import type { TaskDTO } from "./types";

export function useTasksQuery(q: string) {
  return useQuery({
    queryKey: tasksQueryKey(q),
    queryFn: () => fetchTasks({ q }),
  });
}

async function createTask(title: string): Promise<TaskDTO> {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error("Failed to create task");
  const data: { task: TaskDTO } = await res.json();
  return data.task;
}

export function useCreateTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      // Prefix match invalidates every "q" variant of the tasks list.
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      toast.add({
        title: error instanceof Error ? error.message : "No se pudo crear la tarea",
        type: "error",
      });
    },
  });
}
