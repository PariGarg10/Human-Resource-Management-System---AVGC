import { useCallback, useEffect, useState } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

type KtTask = {
  id: number;
  title: string;
  description?: string | null;
  handoverOwnerId?: number | null;
  handoverOwnerName?: string | null;
  status: string;
};

type ExitItem = {
  clearanceId: number;
  status: string;
  exitRequestId: number;
  lastWorkingDay: string;
  ktSignedOff: boolean;
  employee: { id: number; name: string; employeecode?: string };
  ktTasks: KtTask[];
};

type TeamMember = { id: number; name: string };

export function ManagerExitClearancesPanel() {
  const [items, setItems] = useState<ExitItem[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [assignTo, setAssignTo] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pending, teamData] = await Promise.all([
        api<{ items: ExitItem[] }>('/api/exit/manager/pending'),
        api<{ employees: TeamMember[] }>('/api/manager/employees').catch(() => ({ employees: [] })),
      ]);
      setItems(pending.items || []);
      setTeam(teamData.employees || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function assignTask(taskId: number) {
    const ownerId = assignTo[taskId];
    if (!ownerId) {
      toast('Select a team member', 'error');
      return;
    }
    try {
      await api(`/api/exit/kt-tasks/${taskId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handoverOwnerId: ownerId }),
      });
      toast('Task assigned', 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Assign failed', 'error');
    }
  }

  async function completeTask(taskId: number) {
    try {
      await api(`/api/exit/kt-tasks/${taskId}/complete`, { method: 'PATCH' });
      toast('Task completed', 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  }

  async function ktSignoff(exitRequestId: number) {
    try {
      await api(`/api/exit/kt-signoff/${exitRequestId}`, { method: 'POST' });
      toast('Knowledge transfer signed off', 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Sign-off failed', 'error');
    }
  }

  async function approveClearance(clearanceId: number) {
    setBusyId(clearanceId);
    try {
      await api(`/api/exit/clearance/${clearanceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      toast('Manager clearance approved', 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Approve failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="panel">
      <h2 className="panel-title">Exit clearances & knowledge transfer</h2>
      {loading ? (
        <p className="stat-sub">Loading…</p>
      ) : items.length === 0 ? (
        <p className="stat-sub">No team exits in progress.</p>
      ) : (
        <div className="exit-approval-list">
          {items.map((item) => (
            <article key={item.clearanceId} className="exit-approval-card">
              <header className="exit-approval-head">
                <div>
                  <strong>{item.employee.name}</strong>
                  <span className="stat-sub"> · {item.employee.employeecode}</span>
                  <p className="stat-sub">Last day: {item.lastWorkingDay}</p>
                </div>
                <StatusBadge status={item.status} />
              </header>

              <h4 className="exit-kt-heading">Knowledge transfer tasks</h4>
              {item.ktTasks.length === 0 ? (
                <p className="stat-sub">Employee has not added KT tasks yet.</p>
              ) : (
                <ul className="exit-kt-list">
                  {item.ktTasks.map((t) => (
                    <li key={t.id}>
                      <div>
                        <strong>{t.title}</strong>
                        {t.handoverOwnerName ? (
                          <span className="stat-sub"> → {t.handoverOwnerName}</span>
                        ) : null}
                        <StatusBadge status={t.status} />
                      </div>
                      {t.status !== 'completed' ? (
                        <div className="exit-kt-actions">
                          {!t.handoverOwnerId ? (
                            <>
                              <select
                                value={assignTo[t.id] || ''}
                                onChange={(e) =>
                                  setAssignTo({ ...assignTo, [t.id]: Number(e.target.value) })
                                }
                              >
                                <option value="">Assign to…</option>
                                {team.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => assignTask(t.id)}
                              >
                                Assign
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => completeTask(t.id)}
                            >
                              Mark complete
                            </button>
                          )}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              <div className="exit-approval-actions">
                {!item.ktSignedOff ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => ktSignoff(item.exitRequestId)}
                  >
                    Sign off knowledge transfer
                  </button>
                ) : (
                  <span className="stat-sub">
                    <StatusBadge status="approved" /> KT signed off
                  </span>
                )}
                {item.status === 'pending' && item.ktSignedOff ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busyId === item.clearanceId}
                    onClick={() => approveClearance(item.clearanceId)}
                  >
                    Approve manager clearance
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
