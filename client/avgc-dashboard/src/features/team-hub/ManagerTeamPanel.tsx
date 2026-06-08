import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type TeamMember = {
  id: number;
  employeecode: string;
  name: string;
  email: string;
  department: string | null;
};

type TeamResponse = { employees: TeamMember[] };

export function ManagerTeamPanel() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<TeamResponse>('/api/manager/employees');
      setMembers(data.employees || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your team');
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading your team…</p>;
  }

  if (error) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        {error}
      </p>
    );
  }

  if (!members.length) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No employees are assigned to you yet. Ask an admin to set up manager assignments.
      </p>
    );
  }

  return (
    <div className="w-full ">
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        People who report to you ({members.length}). This list comes from manager assignments, not the full
        organization chart.
      </p>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="bg-[var(--bg-secondary)] text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Department</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 font-mono text-xs">{m.employeecode}</td>
                <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">{m.name}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{m.email}</td>
                <td className="px-4 py-3">{m.department || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
