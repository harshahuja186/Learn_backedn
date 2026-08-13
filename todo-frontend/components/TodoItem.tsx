"use client";

import type { Priority, Todo } from "@/lib/types";

type TodoItemProps = {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  busy?: boolean;
};

const priorityTone: Record<Priority, string> = {
  low: "bg-[#d1fadf] text-ok",
  medium: "bg-[#fef0c7] text-warn",
  high: "bg-[#fee4e2] text-danger",
};

export function TodoItem({ todo, onToggle, onEdit, onDelete, busy }: TodoItemProps) {
  return (
    <article
      className={`animate-rise group border-b border-line/70 py-4 last:border-b-0 ${
        busy ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label={todo.completed ? "Mark incomplete" : "Mark complete"}
          onClick={() => onToggle(todo)}
          disabled={busy}
          className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
            todo.completed
              ? "border-accent bg-accent text-white"
              : "border-line bg-surface hover:border-accent"
          }`}
        >
          {todo.completed ? (
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3.5 8.5 6.5 11.5 12.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3
              className={`font-display text-lg leading-snug tracking-tight ${
                todo.completed ? "text-ink-muted line-through" : "text-ink"
              }`}
            >
              {todo.title}
            </h3>
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${priorityTone[todo.priority]}`}
            >
              {todo.priority}
            </span>
          </div>

          <p
            className={`mt-1 text-sm leading-relaxed ${
              todo.completed ? "text-ink-muted/70 line-through" : "text-ink-muted"
            }`}
          >
            {todo.description}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {todo.tags?.map((tag) => (
              <span
                key={tag}
                className="rounded bg-accent-soft/70 px-2 py-0.5 text-xs capitalize text-ink-muted"
              >
                {tag}
              </span>
            ))}
            {todo.dueDate ? (
              <span className="text-xs text-ink-muted">
                Due {new Date(todo.dueDate).toLocaleDateString()}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onEdit(todo)}
            disabled={busy}
            className="rounded-md px-2 py-1 text-sm text-ink-muted transition hover:bg-accent-soft/50 hover:text-ink"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(todo)}
            disabled={busy}
            className="rounded-md px-2 py-1 text-sm text-danger/80 transition hover:bg-[#fee4e2] hover:text-danger"
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}
