export type TaskPriority = 'High' | 'Medium' | 'Low';

export type Task = {
  id: string;
  title: string;
  priority: TaskPriority;
  dueDate: string;
  done: boolean;
};

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function tomorrowISO(fromDate: string) {
  const d = new Date(`${fromDate}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function isPastDue(dueDate: string) {
  return dueDate < todayISO();
}

export const PRIORITY_BADGE: Record<TaskPriority, string> = {
  High: 'bg-[var(--red-soft)] text-avgc-brand border-red-200',
  Medium: 'bg-amber-50 text-amber-900 border-amber-200',
  Low: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};
