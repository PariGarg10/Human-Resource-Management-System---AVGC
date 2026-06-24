import { useCallback, useEffect, useState } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

type HrRequest = {
  id: number;
  exitType?: string;
  requestedLastWorkingDay?: string;
  employeeReason?: string;
  employee: { id: number; name: string; employeecode?: string; department?: string };
};

type ClearanceItem = {
  clearanceId: number;
  status: string;
  exitRequestId: number;
  lastWorkingDay: string;
  activeAssets: number;
  employee: { id: number; name: string; employeecode?: string };
  relievingLetterUrl?: string | null;
  experienceLetterUrl?: string | null;
  interview?: {
    hrInterviewNotes?: string | null;
    finalReason?: string | null;
    employeeSubmittedAt?: string | null;
  };
};

function clearanceTabLabel(tab: 'it' | 'finance' | 'admin') {
  if (tab === 'it') return 'IT';
  return tab.charAt(0).toUpperCase() + tab.slice(1);
}

export function AdminExitClearancesPanel() {
  const [mainTab, setMainTab] = useState<'review' | 'clearances' | 'letters'>('review');
  const [clearTab, setClearTab] = useState<'it' | 'finance' | 'admin'>('it');
  const [hrRequests, setHrRequests] = useState<HrRequest[]>([]);
  const [clearances, setClearances] = useState<ClearanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reviewLwd, setReviewLwd] = useState<Record<number, string>>({});
  const [interviewNotes, setInterviewNotes] = useState<Record<number, string>>({});
  const [letterCandidates, setLetterCandidates] = useState<
    { id: number; employeeName: string; lastWorkingDay?: string; relievingLetterUrl?: string | null; allClearancesApproved?: boolean }[]
  >([]);

  const loadHr = useCallback(async () => {
    const data = await api<{ items: HrRequest[] }>('/api/exit/admin/requests');
    setHrRequests(data.items || []);
  }, []);

  const loadClearances = useCallback(async () => {
    const data = await api<{ items: ClearanceItem[] }>(`/api/exit/admin/pending?type=${clearTab}`);
    setClearances(data.items || []);
  }, [clearTab]);

  const loadLetters = useCallback(async () => {
    const data = await api<{
      items: {
        id: number;
        employeeName: string;
        lastWorkingDay?: string;
        relievingLetterUrl?: string | null;
        allClearancesApproved?: boolean;
      }[];
    }>('/api/exit/admin/all');
    setLetterCandidates(
      (data.items || []).filter((i) => i.allClearancesApproved && !i.relievingLetterUrl)
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (mainTab === 'review') await loadHr();
      else if (mainTab === 'letters') await loadLetters();
      else await loadClearances();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Load failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [mainTab, loadHr, loadClearances, loadLetters]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function approveRequest(id: number) {
    const lwd = reviewLwd[id];
    if (!lwd) {
      toast('Set confirmed last working day', 'error');
      return;
    }
    setBusyId(id);
    try {
      await api(`/api/exit/admin/review/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', confirmedLastWorkingDay: lwd }),
      });
      toast('Exit approved — employee is serving notice', 'success');
      await loadHr();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Approve failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function rejectRequest(id: number) {
    setBusyId(id);
    try {
      await api(`/api/exit/admin/review/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      });
      toast('Request rejected', 'success');
      await loadHr();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Reject failed', 'error');
    } finally {
      setBusyId(null);
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
      toast('Clearance approved', 'success');
      await loadClearances();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Approve failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function returnAssets(employeeId: number) {
    try {
      await api(`/api/exit/admin/return-assets/${employeeId}`, { method: 'POST' });
      toast('Assets marked returned', 'success');
      await loadClearances();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  }

  async function saveInterview(exitRequestId: number) {
    const notes = interviewNotes[exitRequestId];
    if (!notes?.trim()) return;
    try {
      await api(`/api/exit/admin/interview/${exitRequestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hrInterviewNotes: notes }),
      });
      toast('Interview notes saved', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error');
    }
  }

  async function generateLetters(exitRequestId: number) {
    setBusyId(exitRequestId);
    try {
      const data = await api<{ relievingLetterUrl: string; experienceLetterUrl: string }>(
        `/api/exit/admin/letters/${exitRequestId}`,
        { method: 'POST' }
      );
      toast('Letters generated', 'success');
      window.open(data.relievingLetterUrl, '_blank');
      await loadClearances();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Letter generation failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="panel admin-exit-clearances">
      <h2 className="panel-title">Exit Formalities</h2>
      <div className="exit-admin-tabs">
        {(['review', 'clearances', 'letters'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`btn btn-sm ${mainTab === t ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setMainTab(t)}
          >
            {t === 'review' ? 'HR review' : t === 'clearances' ? 'Clearances' : 'Letters'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="stat-sub">Loading…</p>
      ) : mainTab === 'review' ? (
        hrRequests.length === 0 ? (
          <p className="stat-sub">No exit requests pending HR review.</p>
        ) : (
          <div className="exit-approval-list">
            {hrRequests.map((r) => (
              <article key={r.id} className="exit-approval-card">
                <header className="exit-approval-head">
                  <div>
                    <strong>{r.employee.name}</strong>
                    <span className="stat-sub"> · {r.employee.employeecode}</span>
                    <p className="stat-sub">
                      {r.exitType} · requested {r.requestedLastWorkingDay}
                    </p>
                    <p className="stat-sub">{r.employeeReason}</p>
                  </div>
                  <StatusBadge status="pending" />
                </header>
                <label className="form-group">
                  <span>Confirmed last working day</span>
                  <input
                    type="date"
                    value={reviewLwd[r.id] || r.requestedLastWorkingDay || ''}
                    onChange={(e) => setReviewLwd({ ...reviewLwd, [r.id]: e.target.value })}
                  />
                </label>
                <div className="exit-approval-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busyId === r.id}
                    onClick={() => approveRequest(r.id)}
                  >
                    Approve & start notice
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busyId === r.id}
                    onClick={() => rejectRequest(r.id)}
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
        )
      ) : mainTab === 'letters' ? (
        letterCandidates.length === 0 ? (
          <p className="stat-sub">No employees ready for letter generation yet (all clearances must be approved).</p>
        ) : (
          <div className="exit-approval-list">
            {letterCandidates.map((item) => (
              <article key={item.id} className="exit-approval-card">
                <strong>{item.employeeName}</strong>
                <p className="stat-sub">Last day: {item.lastWorkingDay}</p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busyId === item.id}
                  onClick={() => generateLetters(item.id)}
                >
                  Generate PDF letters
                </button>
              </article>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="exit-admin-tabs">
            {(['it', 'finance', 'admin'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`btn btn-sm ${clearTab === t ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setClearTab(t)}
              >
                {clearanceTabLabel(t)}
              </button>
            ))}
          </div>
          {clearances.filter((i) => i.status === 'pending').length === 0 ? (
            <p className="stat-sub">No pending {clearanceTabLabel(clearTab)} clearances.</p>
          ) : (
            <div className="exit-approval-list">
              {clearances
                .filter((i) => i.status === 'pending')
                .map((item) => (
                  <article key={item.clearanceId} className="exit-approval-card">
                    <header className="exit-approval-head">
                      <div>
                        <strong>{item.employee.name}</strong>
                        <p className="stat-sub">Last day: {item.lastWorkingDay}</p>
                        {clearTab === 'it' ? (
                          <p className="stat-sub">Active assets: {item.activeAssets}</p>
                        ) : null}
                      </div>
                      <StatusBadge status={item.status} />
                    </header>
                    {item.interview?.employeeSubmittedAt ? (
                      <p className="stat-sub">Exit interview submitted by employee</p>
                    ) : null}
                    <textarea
                      className="exit-interview-notes"
                      placeholder="HR interview notes"
                      value={interviewNotes[item.exitRequestId] || item.interview?.hrInterviewNotes || ''}
                      onChange={(e) =>
                        setInterviewNotes({ ...interviewNotes, [item.exitRequestId]: e.target.value })
                      }
                      rows={2}
                    />
                    <div className="exit-approval-actions">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => saveInterview(item.exitRequestId)}
                      >
                        Save interview notes
                      </button>
                      {clearTab === 'it' && item.activeAssets > 0 ? (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => returnAssets(item.employee.id)}
                        >
                          Mark all assets returned
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={
                          busyId === item.clearanceId ||
                          (clearTab === 'it' && item.activeAssets > 0)
                        }
                        onClick={() => approveClearance(item.clearanceId)}
                      >
                        Approve {clearanceTabLabel(clearTab)} clearance
                      </button>
                    </div>
                  </article>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
