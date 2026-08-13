"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Todo, TodoInput } from "@/lib/types";
import { TodoForm } from "./TodoForm";
import { TodoItem } from "./TodoItem";

const LIMIT = 10;

export function TodoBoard() {
  const router = useRouter();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Todo | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");

  const loadTodos = useCallback(async (nextPage = page) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getTodos(nextPage, LIMIT);
      setTodos(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages || 1);
      setSource(res.source || "");
      setPage(nextPage);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load todos";
      setError(message);
      if (message.toLowerCase().includes("not authorized")) {
        router.replace("/login");
      }
    } finally {
      setLoading(false);
    }
  }, [page, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api.me();
        if (!cancelled) setUserName(me.data.name);
      } catch {
        if (!cancelled) router.replace("/login");
        return;
      }
      if (!cancelled) await loadTodos(1);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (data: TodoInput) => {
    await api.createTodo(data);
    await loadTodos(1);
  };

  const handleUpdate = async (data: TodoInput) => {
    if (!editing) return;
    setBusyId(editing._id);
    try {
      await api.updateTodo(editing._id, data);
      setEditing(null);
      await loadTodos(page);
    } finally {
      setBusyId(null);
    }
  };

  const handleToggle = async (todo: Todo) => {
    setBusyId(todo._id);
    try {
      await api.updateTodo(todo._id, {
        title: todo.title,
        description: todo.description,
        priority: todo.priority,
        tags: todo.tags,
        dueDate: todo.dueDate?.slice(0, 10),
        completed: !todo.completed,
      });
      await loadTodos(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (todo: Todo) => {
    if (!confirm(`Delete “${todo.title}”?`)) return;
    setBusyId(todo._id);
    try {
      await api.deleteTodo(todo._id);
      const nextPage = todos.length === 1 && page > 1 ? page - 1 : page;
      await loadTodos(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <header className="animate-fade mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-4xl tracking-tight text-ink sm:text-5xl">Taskflow</p>
          <p className="mt-2 text-ink-muted">
            {userName ? `Hey ${userName} — ` : ""}
            {total} task{total === 1 ? "" : "s"}
            {source ? ` · served from ${source}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
        >
          Sign out
        </button>
      </header>

      <section className="animate-rise mb-8 rounded-2xl border border-line/80 bg-surface/80 p-5 shadow-[0_20px_50px_-30px_rgba(20,36,31,0.45)] backdrop-blur-sm sm:p-6">
        <h2 className="mb-4 font-display text-xl text-ink">
          {editing ? "Edit task" : "New task"}
        </h2>
        <TodoForm
          key={editing?._id ?? "create"}
          initial={editing}
          onSubmit={editing ? handleUpdate : handleCreate}
          onCancel={editing ? () => setEditing(null) : undefined}
          submitLabel={editing ? "Save changes" : "Add task"}
        />
      </section>

      <section className="animate-rise rounded-2xl border border-line/80 bg-surface/80 px-5 shadow-[0_20px_50px_-30px_rgba(20,36,31,0.45)] backdrop-blur-sm sm:px-6" style={{ animationDelay: "80ms" }}>
        {error ? (
          <p className="py-4 text-sm text-danger">{error}</p>
        ) : null}

        {loading ? (
          <p className="py-10 text-center text-ink-muted">Loading tasks…</p>
        ) : todos.length === 0 ? (
          <p className="py-10 text-center text-ink-muted">No tasks yet. Add your first one above.</p>
        ) : (
          <div>
            {todos.map((todo) => (
              <TodoItem
                key={todo._id}
                todo={todo}
                busy={busyId === todo._id}
                onToggle={handleToggle}
                onEdit={setEditing}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-line/70 py-4">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => loadTodos(page - 1)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-ink-muted">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => loadTodos(page + 1)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        ) : (
          <div className="h-2" />
        )}
      </section>
    </div>
  );
}
