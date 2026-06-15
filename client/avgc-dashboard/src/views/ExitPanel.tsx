import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

const EXIT_TYPES = [
  { value: 'resignation', label: 'Resignation' },
  { value: 'voluntary', label: 'Voluntary separation' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'mutual_separation', label: 'Mutual separation' },
  { value: 'other', label: 'Other' },
];

type Clearance = { id: number; clearanceType: string; status: string };
type KtTask = {
  id: number;
  title: string;
  description?: string | null;
  handoverOwnerName?: string | null;
  status: string;
};
type ExitRequest = {
  id: number;
  status: string;
  exitType?: string;
  lastWorkingDay?: string;
  requestedLastWorkingDay?: string;
  confirmedLastWorkingDay?: string;
  reason?: string;
  employeeReason?: string;
  ktSignedOff?: boolean;
  relievingLetterUrl?: string | null;
  experienceLetterUrl?: string | null;
  clearances: Clearance[];
};
type NoticeSummary = {
  noticeStart: string;
  lastWorkingDay: string;
  daysUntilLastWorkingDay: number;
  attendance: { presentDays: number; leaveDays: number; lopDays: number };
  leaveTotals: { remaining: number; used: number; total: number };
};

function clearanceStatus(clearances: Clearance[], type: string) {
  return clearances.find((c) => c.clearanceType === type)?.status || 'pending';
}

function ExitRequestForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [exitType, setExitType] = useState('resignation');
  const [reason, setReason] = useState('');
  const [lwd, setLwd] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    try {
      await api('/api/exit/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exitType, reason, requestedLastWorkingDay: lwd }),
      });
      toast('Exit request submitted — HR will review shortly', 'success');
      onSubmitted();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not submit request', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel exit-request-form">
      <h2 className="panel-title">Submit exit request</h2>
      <p className="stat-sub">
        Tell HR about your separation. Once approved, you&apos;ll enter your notice period and complete
        exit formalities.
      </p>
      <form className="exit-form" onSubmit={submit}>
        <label className="form-group">
          <span>Exit type</span>
          <select value={exitType} onChange={(e) => setExitType(e.target.value)} required>
            {EXIT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-group">
          <span>Requested last working day</span>
          <input type="date" value={lwd} onChange={(e) => setLwd(e.target.value)} required />
        </label>
        <label className="form-group">
          <span>Reason</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} required />
        </label>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit to HR'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ExitPanel() {
  const [request, setRequest] = useState<ExitRequest | null>(null);
  const [pendingReview, setPendingReview] = useState(false);
  const [ktTasks, setKtTasks] = useState<KtTask[]>([]);
  const [noticeSummary, setNoticeSummary] = useState<NoticeSummary | null>(null);
  const [assets, setAssets] = useState<{ id: number; name: string; status: string }[]>([]);
  const [interviewDone, setInterviewDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newKtTitle, setNewKtTitle] = useState('');
  const [newKtDesc, setNewKtDesc] = useState('');
  const [interview, setInterview] = useState({
    overallExperience: '',
    reasonForLeaving: '',
    suggestions: '',
    wouldRecommend: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{
        request: ExitRequest | null;
        ktTasks?: KtTask[];
        noticeSummary?: NoticeSummary | null;
        assets?: { id: number; name: string; status: string }[];
        interview?: { employeeSubmittedAt?: string | null } | null;
      }>('/api/exit/my');
      setRequest(data.request);
      setPendingReview(data.request?.status === 'pending_hr_review');
      setKtTasks(data.ktTasks || []);
      setNoticeSummary(data.noticeSummary || null);
      setAssets(data.assets || []);
      setInterviewDone(Boolean(data.interview?.employeeSubmittedAt));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load exit details', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const clearanceSteps = useMemo(
    () => [
      { key: 'manager', label: 'Manager' },
      { key: 'it', label: 'IT' },
      { key: 'finance', label: 'Finance' },
      { key: 'admin', label: 'Admin' },
    ],
    []
  );

  async function addKtTask() {
    if (!request || !newKtTitle.trim()) return;
    try {
      await api('/api/exit/kt-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exitRequestId: request.id,
          title: newKtTitle.trim(),
          description: newKtDesc.trim() || null,
        }),
      });
      setNewKtTitle('');
      setNewKtDesc('');
      toast('KT task added', 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not add task', 'error');
    }
  }

  async function submitInterview() {
    if (!request) return;
    try {
      await api('/api/exit/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exitRequestId: request.id, selfAssessment: interview }),
      });
      toast('Exit interview submitted', 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Submit failed', 'error');
    }
  }

  if (loading) {
    return (
      <div className="panel">
        <p className="stat-sub">Loading exit portal…</p>
      </div>
    );
  }

  if (!request) {
    return <ExitRequestForm onSubmitted={load} />;
  }

  if (pendingReview) {
    return (
      <div className="panel exit-portal">
        <h2 className="panel-title">Exit request pending HR review</h2>
        <p className="stat-sub">
          Type: <strong>{request.exitType}</strong> · Requested last day:{' '}
          <strong>{request.requestedLastWorkingDay}</strong>
        </p>
        <p className="stat-sub">{request.employeeReason || request.reason}</p>
        <StatusBadge status="pending" />
      </div>
    );
  }

  const inNotice = ['serving_notice', 'clearances_pending', 'letters_ready', 'in_progress'].includes(
    request.status
  );

  return (
    <div className="exit-portal">
      <div className="panel exit-portal-header">
        <h2 className="panel-title">Exit portal</h2>
        <p className="stat-sub">
          Status: <StatusBadge status={request.status} /> · Last working day:{' '}
          <strong>{request.confirmedLastWorkingDay || request.lastWorkingDay}</strong>
        </p>
        {inNotice && noticeSummary ? (
          <div className="exit-notice-summary">
            <div className="exit-notice-stat">
              <span className="exit-notice-stat-val">{noticeSummary.daysUntilLastWorkingDay}</span>
              <span className="stat-sub">working days left</span>
            </div>
            <div className="exit-notice-stat">
              <span className="exit-notice-stat-val">{noticeSummary.attendance.lopDays}</span>
              <span className="stat-sub">LOP days (notice)</span>
            </div>
            <div className="exit-notice-stat">
              <span className="exit-notice-stat-val">{noticeSummary.leaveTotals.remaining}</span>
              <span className="stat-sub">leave balance left</span>
            </div>
          </div>
        ) : null}
        <div className="exit-stepper" aria-label="Clearance progress">
          {clearanceSteps.map((step, idx) => (
            <div
              key={step.key}
              className={`exit-step exit-step--${clearanceStatus(request.clearances, step.key)}`}
            >
              <span className="exit-step-num">{idx + 1}</span>
              <span className="exit-step-label">{step.label}</span>
              <StatusBadge status={clearanceStatus(request.clearances, step.key)} />
            </div>
          ))}
        </div>
      </div>

      <div className="exit-workflow-grid">
        <article className="panel exit-section">
          <h3 className="panel-title">Exit interview</h3>
          {interviewDone ? (
            <p className="stat-sub">
              <StatusBadge status="approved" /> Self-assessment submitted — thank you.
            </p>
          ) : (
            <>
              <label className="form-group">
                <span>Overall experience</span>
                <textarea
                  value={interview.overallExperience}
                  onChange={(e) => setInterview({ ...interview, overallExperience: e.target.value })}
                  rows={2}
                />
              </label>
              <label className="form-group">
                <span>Reason for leaving</span>
                <textarea
                  value={interview.reasonForLeaving}
                  onChange={(e) => setInterview({ ...interview, reasonForLeaving: e.target.value })}
                  rows={2}
                />
              </label>
              <label className="form-group">
                <span>Suggestions for improvement</span>
                <textarea
                  value={interview.suggestions}
                  onChange={(e) => setInterview({ ...interview, suggestions: e.target.value })}
                  rows={2}
                />
              </label>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => submitInterview()}>
                Submit exit interview
              </button>
            </>
          )}
        </article>

        <article className="panel exit-section">
          <h3 className="panel-title">Knowledge transfer</h3>
          <p className="stat-sub">List tasks to hand over. Your manager will assign owners.</p>
          {request.ktSignedOff ? (
            <p className="stat-sub">
              <StatusBadge status="approved" /> Manager signed off knowledge transfer
            </p>
          ) : null}
          <ul className="exit-kt-list">
            {ktTasks.map((t) => (
              <li key={t.id}>
                <strong>{t.title}</strong>
                {t.handoverOwnerName ? <span className="stat-sub"> → {t.handoverOwnerName}</span> : null}
                <StatusBadge status={t.status} />
              </li>
            ))}
          </ul>
          <div className="exit-kt-add">
            <input
              type="text"
              placeholder="Task title"
              value={newKtTitle}
              onChange={(e) => setNewKtTitle(e.target.value)}
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newKtDesc}
              onChange={(e) => setNewKtDesc(e.target.value)}
            />
            <button type="button" className="btn btn-outline btn-sm" onClick={() => addKtTask()}>
              Add task
            </button>
          </div>
        </article>

        <article className="panel exit-section">
          <h3 className="panel-title">Assets</h3>
          {assets.length === 0 ? (
            <p className="stat-sub">No assets allocated.</p>
          ) : (
            <ul className="exit-asset-list">
              {assets.map((a) => (
                <li key={a.id}>
                  <span>{a.name}</span>
                  <StatusBadge status={a.status === 'active' ? 'pending' : 'approved'} />
                </li>
              ))}
            </ul>
          )}
        </article>

        {(request.relievingLetterUrl || request.experienceLetterUrl) && (
          <article className="panel exit-section">
            <h3 className="panel-title">Your letters</h3>
            <div className="exit-letter-links">
              {request.relievingLetterUrl ? (
                <a href={request.relievingLetterUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                  Relieving letter
                </a>
              ) : null}
              {request.experienceLetterUrl ? (
                <a href={request.experienceLetterUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                  Experience letter
                </a>
              ) : null}
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
