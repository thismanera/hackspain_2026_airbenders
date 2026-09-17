"use client";

import { useQueryStates } from "nuqs";
import { useState } from "react";

import { cn } from "@/lib/core/utils";
import { useCreateTaskMutation, useTasksQuery } from "@/lib/features/tasks/hooks";
import { tasksSearchParams } from "@/lib/features/tasks/search-params";

export function TasksClient() {
  const [{ q }, setSearchParams] = useQueryStates(tasksSearchParams);
  const { data: tasks, isPending } = useTasksQuery(q);
  const createTask = useCreateTaskMutation();
  const [title, setTitle] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <input
        className="rounded-md border px-3 py-2 text-sm"
        placeholder="Buscar tareas..."
        value={q}
        onChange={(event) => void setSearchParams({ q: event.target.value || null })}
      />

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = title.trim();
          if (!trimmed) return;
          createTask.mutate(trimmed, { onSuccess: () => setTitle("") });
        }}
      >
        <input
          className="flex-1 rounded-md border px-3 py-2 text-sm"
          placeholder="Nueva tarea"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button
          type="submit"
          disabled={createTask.isPending}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm disabled:opacity-50"
        >
          Añadir
        </button>
      </form>

      {isPending ? (
        <p className="text-muted-foreground text-sm">Cargando...</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks?.map((task) => (
            <li
              key={task.id}
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                task.done && "line-through opacity-60",
              )}
            >
              {task.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
