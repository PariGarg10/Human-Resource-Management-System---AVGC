import { useCallback, useEffect, useMemo, useState } from 'react';
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

type TaskFilter = 'all' | 'open' | 'completed';

function formatDueLabel(dueDate: string) {
  const today = todayISO();
  if (dueDate === today) return 'Due today';
  if (dueDate < today) return `Overdue · ${dueDate}`;
  return `Due ${dueDate}`;
}

export function TaskManagerPanel({ userName }: Props = {}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('Medium');
  const [newDueDate, setNewDueDate] = useState(todayISO);
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [showAllCompleted, setShowAllCompleted] = useState(true);
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

  const today = todayISO();

  const grouped = useMemo(() => {
    const open = tasks.filter((t) => !t.done);
    const completed = tasks.filter((t) => t.done);
    const overdue = open.filter((t) => t.dueDate < today);
    const dueToday = open.filter((t) => t.dueDate === today);
    const upcoming = open.filter((t) => t.dueDate > today);
    return { open, completed, overdue, dueToday, upcoming };
  }, [tasks, today]);

  const visibleCompleted = showAllCompleted ? grouped.completed : grouped.completed.slice(0, 15);
  const hiddenCompletedCount = grouped.completed.length - visibleCompleted.length;

  const filteredSections = useMemo(() => {
    if (filter === 'completed') {
      return {
        overdue: [] as Task[],
        dueToday: [] as Task[],
        upcoming: [] as Task[],
        completed: grouped.completed,
      };
    }
    if (filter === 'open') {
      return {
        overdue: grouped.overdue,
        dueToday: grouped.dueToday,
        upcoming: grouped.upcoming,
        completed: [] as Task[],
      };
    }
    return {
      overdue: grouped.overdue,
      dueToday: grouped.dueToday,
      upcoming: grouped.upcoming,
      completed: visibleCompleted,
    };
  }, [filter, grouped, visibleCompleted]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    try {
      const data = await api<{ task: Task }>('/api/users/my-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, priority: newPriority, dueDate: newDueDate }),
      });
      setTasks((prev) => [...prev, data.task]);
      setNewTitle('');
      setNewPriority('Medium');
      setNewDueDate(todayISO());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add task');
    }
  }

  async function toggleDone(task: Task) {
    try {
      const nextDone = !task.done;
      const data = await api<{ task: Task }>(`/api/users/my-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: nextDone }),
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? data.task : t)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update task');
    }
  }

  async function removeTask(id: string) {
    if (!window.confirm('Delete this task?')) return;
    try {
      await api(`/api/users/my-tasks/${id}`, { method: 'DELETE' });
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setError(null);
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
      setError(null);
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
            ? 'border-[var(--border)] bg-[var(--bg-secondary)] opacity-90'
            : showRoll
              ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20'
              : 'border-[var(--border)] bg-[var(--bg-card)]'
        }`}
      >
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => toggleDone(task)}
          className="mt-1 h-[18px] w-[18px] shrink-0 cursor-pointer accent-[#ed1d24]"
          aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-sm font-semibold text-[var(--text-primary)] ${task.done ? 'line-through opacity-70' : ''}`}
            >
              {task.title}
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${PRIORITY_BADGE[task.priority]}`}
            >
              {task.priority}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{formatDueLabel(task.dueDate)}</p>
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
          className="shrink-0 text-xl leading-none text-[var(--text-muted)] hover:text-avgc-brand"
          title="Delete"
          onClick={() => removeTask(task.id)}
        >
          ×
        </button>
      </div>
    );
  }

  function renderSection(title: string, items: Task[], inDone: boolean) {
    if (!items.length) return null;
    return (
      <div className="mb-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-avgc-brand">
          {title} <span className="font-normal text-[var(--text-muted)]">({items.length})</span>
        </p>
        <div className="space-y-2">{items.map((t) => renderTask(t, inDone))}</div>
      </div>
    );
  }

  if (loading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading your tasks…</p>;
  }

  const openCount = grouped.open.length;
  const doneCount = grouped.completed.length;

  return (
    <div className="w-full ">
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        Personal tasks for <strong className="text-[var(--text-primary)]">{displayName}</strong> — only you
        can see and edit these. All past and completed tasks stay in your list.
      </p>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ['all', `All (${tasks.length})`],
            ['open', `Open (${openCount})`],
            ['completed', `Completed (${doneCount})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              filter === key
                ? 'bg-avgc-brand text-white'
                : 'border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
        <form
          onSubmit={addTask}
          className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_120px_150px_auto]"
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New task title…"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-avgc-brand sm:col-span-2 lg:col-span-1"
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
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)]"
            title="Due date"
          />
          <button
            type="submit"
            className="rounded-lg bg-avgc-brand px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Add task
          </button>
        </form>

        {tasks.length === 0 ? (
          <p className="text-sm italic text-[var(--text-muted)]">No tasks yet — add one above.</p>
        ) : (
          <>
            {renderSection('Overdue', filteredSections.overdue, false)}
            {renderSection('Due today', filteredSections.dueToday, false)}
            {renderSection('Upcoming', filteredSections.upcoming, false)}
            {filter !== 'open' && renderSection('Completed', filteredSections.completed, true)}
            {filter === 'all' && hiddenCompletedCount > 0 && !showAllCompleted && (
              <button
                type="button"
                className="mt-2 text-sm font-semibold text-avgc-brand hover:underline"
                onClick={() => setShowAllCompleted(true)}
              >
                Show {hiddenCompletedCount} more completed task{hiddenCompletedCount === 1 ? '' : 's'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
