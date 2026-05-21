import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { readEmployee } from '@/lib/api';
import {
  PRIORITY_BADGE,
  type Task,
  type TaskPriority,
  todayISO,
  tomorrowISO,
  isPastDue,
} from '@/features/team-hub/data';

type Props = {
  userName?: string | null;
};

type TasksResponse = { tasks: Task[] };

export function TaskManagerPanel({ userName }: Props = {}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('Medium');
  const displayName = userName || readEmployee()?.name || 'You';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<TasksResponse>('/api/users/my-tasks');
      setTasks(data.tasks || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load tasks');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    try {
      const data = await api<{ task: Task }>('/api/users/my-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, priority: newPriority, dueDate: todayISO() }),
      });
      setTasks((prev) => [...prev, data.task]);
      setNewTitle('');
      setNewPriority('Medium');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add task');
    }
  }

  async function toggleDone(task: Task) {
    try {
      const data = await api<{ task: Task }>(`/api/users/my-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !task.done }),
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? data.task : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update task');
    }
  }

  async function removeTask(id: string) {
    try {
      await api(`/api/users/my-tasks/${id}`, { method: 'DELETE' });
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete task');
    }
  }

  async function rollToTomorrow(task: Task) {
    try {
      const data = await api<{ task: Task }>(`/api/users/my-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: tomorrowISO(task.dueDate) }),
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? data.task : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not roll task');
    }
  }

  function renderTask(task: Task, inDone: boolean) {
    const showRoll = !task.done && isPastDue(task.dueDate);
    return (
      <div
        key={task.id}
        className={`flex gap-3 rounded-xl border p-3 ${
          inDone
            ? 'border-[var(--border)] bg-[var(--bg-secondary)] opacity-80'
            : 'border-[var(--border)] bg-[var(--bg-card)]'
        }`}
      >
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => toggleDone(task)}
          className="mt-1 h-[18px] w-[18px] accent-[#ed1d24]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-sm font-semibold text-[var(--text-primary)] ${task.done ? 'line-through' : ''}`}
            >
              {task.title}
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${PRIORITY_BADGE[task.priority]}`}
            >
              {task.priority}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Due {task.dueDate}</p>
          {showRoll && (
            <button
              type="button"
              className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--red-soft)] px-2.5 py-1 text-[11px] font-semibold text-avgc-brand"
              onClick={() => rollToTomorrow(task)}
            >
              Roll to tomorrow
            </button>
          )}
        </div>
        <button
          type="button"
          className="text-xl leading-none text-[var(--text-muted)] hover:text-avgc-brand"
          title="Delete"
          onClick={() => removeTask(task.id)}
        >
          ×
        </button>
      </div>
    );
  }

  if (loading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading your tasks…</p>;
  }

  return (
    <div className="w-full font-['DM_Sans',sans-serif]">
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        Personal daily tasks for <strong className="text-[var(--text-primary)]">{displayName}</strong> — only
        you can see and edit these.
      </p>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
        <form onSubmit={addTask} className="mb-5 grid gap-2 md:grid-cols-[minmax(0,1fr)_140px_auto]">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New task title…"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-avgc-brand"
          />
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)]"
          >
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-avgc-brand px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Add
          </button>
        </form>

        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-avgc-brand">Today&apos;s tasks</p>
        {active.length === 0 ? (
          <p className="text-sm italic text-[var(--text-muted)]">No open tasks — add one above.</p>
        ) : (
          <div className="space-y-2">{active.map((t) => renderTask(t, false))}</div>
        )}

        <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-avgc-brand">Done</p>
        {done.length === 0 ? (
          <p className="text-sm italic text-[var(--text-muted)]">Nothing completed yet.</p>
        ) : (
          <div className="space-y-2">{done.map((t) => renderTask(t, true))}</div>
        )}
      </div>
    </div>
  );
}
