"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Priority, Todo, TodoInput, TodoTag } from "@/lib/types";

const TAGS: TodoTag[] = ["work", "personal", "urgent", "others"];
const PRIORITIES: Priority[] = ["low", "medium", "high"];

type TodoFormProps = {
  initial?: Todo | null;
  onSubmit: (data: TodoInput) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
};

export function TodoForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = "Add task",
}: TodoFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "medium");
  const [tags, setTags] = useState<TodoTag[]>(initial?.tags ?? []);
  const [dueDate, setDueDate] = useState(
    initial?.dueDate ? initial.dueDate.slice(0, 10) : "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!initial) return;
    setTitle(initial.title);
    setDescription(initial.description);
    setPriority(initial.priority);
    setTags(initial.tags ?? []);
    setDueDate(initial.dueDate ? initial.dueDate.slice(0, 10) : "");
  }, [initial]);

  const toggleTag = (tag: TodoTag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.");
      return;
    }
    if (tags.length === 0) {
      setError("Pick at least one tag.");
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        priority,
        tags,
        dueDate: dueDate || undefined,
        completed: initial?.completed ?? false,
      });
      if (!initial) {
        setTitle("");
        setDescription("");
        setPriority("medium");
        setTags([]);
        setDueDate("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-medium text-ink-muted">
          Title
        </label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="What needs doing?"
          className="rounded-lg border border-line bg-surface px-3 py-2.5 text-ink outline-none transition focus:border-accent"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-ink-muted">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Add a bit more context"
          className="resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-ink outline-none transition focus:border-accent"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="priority" className="text-sm font-medium text-ink-muted">
            Priority
          </label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="rounded-lg border border-line bg-surface px-3 py-2.5 text-ink outline-none transition focus:border-accent"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="dueDate" className="text-sm font-medium text-ink-muted">
            Due date
          </label>
          <input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2.5 text-ink outline-none transition focus:border-accent"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink-muted">Tags</span>
        <div className="flex flex-wrap gap-2">
          {TAGS.map((tag) => {
            const active = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`rounded-md px-3 py-1.5 text-sm capitalize transition ${
                  active
                    ? "bg-accent text-white"
                    : "bg-accent-soft/60 text-ink-muted hover:bg-accent-soft"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Saving…" : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-muted transition hover:bg-accent-soft/40"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
