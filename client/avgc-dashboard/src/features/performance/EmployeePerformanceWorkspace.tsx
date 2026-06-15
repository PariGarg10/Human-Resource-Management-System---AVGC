import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { GoalCard } from '@/features/performance/GoalCard';
import { OkrReadOnlyList } from '@/features/performance/OkrReadOnlyList';
import { RatingButtons } from '@/features/performance/RatingButtons';
import { feedbackForEntry, progressForEntry } from '@/features/performance/goalRatingUtils';
import { OkrSetupEditor } from '@/features/performance/OkrSetupEditor';
import type {
  EmployeePerformanceBundle,
  OkrRating,
  PerformanceOkr,
} from '@/features/performance/performanceTypes';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

type Mode = 'manager' | 'admin';

type Props = {
  mode: Mode;
  employeeId: number;
  employeeName?: string;
  year: number;
  quarter: number;
  onBack: () => void;
  onUpdated?: () => void;
  initialTab?: 'okrs' | 'review';
};

function normalizeOkr(o: PerformanceOkr, idx: number): PerformanceOkr & { clientKey: string } {
  return {
    ...o,
    clientKey: o.clientKey || (o.id != null ? `id-${o.id}` : `idx-${idx}`),
    weightage: Number(o.weightage) || 0,
  };
}

function ratingFor(ratings: OkrRating[] | undefined, okrId: number) {
  const hit = (ratings || []).find((r) => Number(r.okrId) === okrId);
  if (!hit) return null;
  const v = (hit as OkrRating & { rating?: number }).rating ?? hit.score;
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

function reviewStatusLabel(status: string) {
  if (status === 'SELF SUBMITTED') return 'Self assessment done';
  if (status === 'MANAGER SUBMITTED') return 'Manager review done';
  if (status === 'LOCKED') return 'Quarter locked';
  return 'Pending self-assessment';
}

function PipelineStep({
  label,
  done,
  active,
}: {
  label: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div
      className={`performance-pipeline-step${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}
    >
      <span className="performance-pipeline-dot" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function EmployeePerformanceWorkspace({
  mode,
  employeeId,
  employeeName,
  year,
  quarter,
  onBack,
  onUpdated,
  initialTab = 'okrs',
}: Props) {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'okrs' | 'review'>(initialTab);
  const [bundle, setBundle] = useState<EmployeePerformanceBundle | null>(null);
  const [okrs, setOkrs] = useState<(PerformanceOkr & { clientKey: string })[]>([]);

  const [mgrRatings, setMgrRatings] = useState<Record<number, number>>({});
  const [mgrFeedbackPerOkr, setMgrFeedbackPerOkr] = useState<Record<number, string>>({});
  const [mgrOverall, setMgrOverall] = useState(3);
  const [mgrFeedback, setMgrFeedback] = useState('');
  const [expandedOkr, setExpandedOkr] = useState<number | null>(null);

  const [adminRatings, setAdminRatings] = useState<Record<number, string>>({});

  const review = bundle?.review;
  const okrsLocked = bundle?.okrsLocked ?? false;
  const weightTotal = useMemo(
    () => okrs.reduce((s, o) => s + (Number(o.weightage) || 0), 0),
    [okrs]
  );

  const adminScorePreview = useMemo(() => {
    return okrs.reduce((sum, o) => {
      if (!o.id) return sum;
      const raw = Number(adminRatings[o.id] || 0);
      return sum + Math.min(raw, o.weightage);
    }, 0);
  }, [okrs, adminRatings]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const path =
        mode === 'admin'
          ? `/api/performance/admin/employee/${employeeId}?year=${year}&quarter=${quarter}`
          : `/api/performance/manager/employee/${employeeId}?year=${year}&quarter=${quarter}`;
      const data = await api<EmployeePerformanceBundle>(path);
      setBundle(data);
      const nextOkrs = (data.okrs || []).map((o, i) => normalizeOkr(o, i));
      setOkrs(nextOkrs);

      const rev = data.review;
      if (rev?.managerRatingPerOkr?.length) {
        const map: Record<number, number> = {};
        const fb: Record<number, string> = {};
        for (const r of rev.managerRatingPerOkr) {
          const id = Number(r.okrId);
          const val = ratingFor(rev.managerRatingPerOkr, id);
          if (val != null) map[id] = val;
        }
        const mf = (rev as { managerFeedbackPerOkr?: OkrRating[] }).managerFeedbackPerOkr;
        if (mf?.length) {
          for (const r of mf) fb[Number(r.okrId)] = feedbackForEntry(mf, Number(r.okrId));
        }
        setMgrRatings(map);
        setMgrFeedbackPerOkr(fb);
      } else {
        setMgrRatings({});
        setMgrFeedbackPerOkr({});
      }
      if (rev?.managerOverallRating != null) setMgrOverall(Number(rev.managerOverallRating));
      if (rev?.managerFeedback) setMgrFeedback(rev.managerFeedback);

      if (rev?.adminRatingPerOkr?.length) {
        const map: Record<number, string> = {};
        for (const r of rev.adminRatingPerOkr) map[r.okrId] = String(r.score);
        setAdminRatings(map);
      } else {
        setAdminRatings({});
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load employee performance', 'error');
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, [mode, employeeId, year, quarter]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  function updateOkr(idx: number, patch: Partial<PerformanceOkr>) {
    setOkrs((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  }

  function addOkr(draft: { objective: string; keyResult: string; kra: string; kpi: string; weightage: number }) {
    setOkrs((prev) => [
      ...prev,
      normalizeOkr({ clientKey: `new-${Date.now()}-${prev.length}`, ...draft }, prev.length),
    ]);
  }

  function removeOkr(idx: number) {
    setOkrs((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveManagerOkrs() {
    if (Math.abs(weightTotal - 100) > 0.01) {
      toast(`OKR weightage must total 100 (current: ${weightTotal})`, 'error');
      return;
    }
    try {
      await api(`/api/performance/manager/okrs/${employeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, quarter, okrs }),
      });
      toast('OKRs updated', 'success');
      await load();
      onUpdated?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save OKRs', 'error');
    }
  }

  async function lockOkrs() {
    try {
      await api(`/api/performance/manager/okrs/${employeeId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, quarter }),
      });
      toast('OKRs locked for the quarter', 'success');
      await load();
      onUpdated?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to lock OKRs', 'error');
    }
  }

  async function submitManagerReview() {
    const managerRatingPerOkr = okrs
      .filter((o) => o.id)
      .map((o) => ({
        okrId: o.id!,
        rating: mgrRatings[o.id!] || 0,
        feedback: mgrFeedbackPerOkr[o.id!] || '',
      }));
    const missing = managerRatingPerOkr.some((r) => !r.rating || r.rating < 1 || r.rating > 5);
    if (missing) {
      toast('Rate each goal from 1 to 5', 'error');
      return;
    }
    if (!mgrFeedback.trim() && !managerRatingPerOkr.some((r) => r.feedback)) {
      toast('Provide overall or per-goal manager feedback', 'error');
      return;
    }
    try {
      await api(`/api/performance/manager/reviews/${employeeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          quarter,
          managerRatingPerOkr,
          managerFeedbackPerOkr: managerRatingPerOkr,
          managerOverallRating: mgrOverall,
          managerFeedback: mgrFeedback.trim(),
        }),
      });
      toast('Manager review submitted', 'success');
      await load();
      onUpdated?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to submit manager review', 'error');
    }
  }

  async function finalizeAdminQuarter() {
    if (okrs.some((o) => o.id && (adminRatings[o.id!] === '' || adminRatings[o.id!] == null))) {
      toast('Rate every OKR before locking the quarter', 'error');
      return;
    }
    const adminRatingPerOkr = okrs
      .filter((o) => o.id)
      .map((o) => ({ okrId: o.id!, score: Number(adminRatings[o.id!] || 0) }));
    try {
      await api(`/api/performance/admin/reviews/${employeeId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, quarter, adminRatingPerOkr }),
      });
      toast('Quarter locked with final score', 'success');
      await load();
      onUpdated?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to finalize quarter', 'error');
    }
  }

  async function unlockQuarter() {
    if (!window.confirm('Unlock this quarter review? You will need to re-finalise after changes.')) return;
    try {
      await api(`/api/performance/admin/reviews/${employeeId}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, quarter, status: 'MANAGER SUBMITTED' }),
      });
      toast('Quarter unlocked', 'success');
      await load();
      onUpdated?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to unlock', 'error');
    }
  }

  const displayName = bundle?.employee?.name || employeeName || 'Employee';
  const status = review?.status || 'PENDING';

  if (loading) {
    return <p className="stat-sub">Loading employee performance…</p>;
  }

  if (!bundle) {
    return (
      <div className="performance-employee-workspace">
        <div className="performance-employee-workspace-back">
          <button type="button" className="btn btn-outline btn-sm performance-back-link" onClick={onBack}>
            ← Back to team
          </button>
        </div>
        <p className="stat-sub">Could not load this employee&apos;s performance data.</p>
      </div>
    );
  }

  return (
    <div className="performance-employee-workspace">
      <div className="performance-employee-workspace-head">
        <div className="performance-employee-workspace-back">
          <button type="button" className="btn btn-outline btn-sm performance-back-link" onClick={onBack}>
            ← Back to list
          </button>
        </div>
        <div className="performance-employee-hero">
          <div>
            <h3 className="panel-title">{displayName}</h3>
            <p className="stat-sub">
              {bundle.employee.employeecode ? `${bundle.employee.employeecode} · ` : ''}
              {bundle.employee.department || '—'} · Q{quarter} {year}
            </p>
          </div>
          <div className="performance-employee-hero-badges">
            <StatusBadge status={okrsLocked ? 'approved' : 'pending'} />
            <span className="performance-review-status-pill">{reviewStatusLabel(status)}</span>
            {review?.adminFinalQuarterScore != null ? (
              <span className="performance-review-score-pill">
                Score: <strong>{review.adminFinalQuarterScore}</strong>/100
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="performance-pipeline">
        <PipelineStep label="OKRs locked" done={okrsLocked} active={!okrsLocked} />
        <PipelineStep
          label="Self-assessment"
          done={['SELF SUBMITTED', 'MANAGER SUBMITTED', 'LOCKED'].includes(status)}
          active={okrsLocked && status === 'PENDING'}
        />
        <PipelineStep
          label="Manager review"
          done={['MANAGER SUBMITTED', 'LOCKED'].includes(status)}
          active={status === 'SELF SUBMITTED'}
        />
        <PipelineStep label="Admin final" done={status === 'LOCKED'} active={status === 'MANAGER SUBMITTED'} />
      </div>

      <div className="exit-admin-tabs">
        <button
          type="button"
          className={`btn btn-sm ${tab === 'okrs' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setTab('okrs')}
        >
          OKRs
        </button>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'review' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setTab('review')}
        >
          Quarter review
        </button>
      </div>

      {tab === 'okrs' ? (
        <div className="panel">
          {mode === 'manager' && !okrsLocked ? (
            <OkrSetupEditor
              okrs={okrs}
              okrsLocked={okrsLocked}
              isManagerView
              weightTotal={weightTotal}
              onChange={updateOkr}
              onAdd={addOkr}
              onRemove={removeOkr}
              onSaveManager={() => saveManagerOkrs()}
              onLock={() => lockOkrs()}
              showManagerActions
              showEmployeeSubmit={false}
            />
          ) : (
            <>
              <p className="stat-sub" style={{ marginBottom: 10 }}>
                {okrsLocked ? 'Locked OKRs for this quarter.' : 'Employee has not locked OKRs yet.'}
              </p>
              <OkrReadOnlyList okrs={okrs} />
            </>
          )}
        </div>
      ) : null}

      {tab === 'review' ? (
        <div className="performance-review-stack">
          <ReviewSection
            title="Step 1 — Employee self-assessment"
            done={['SELF SUBMITTED', 'MANAGER SUBMITTED', 'LOCKED'].includes(status)}
            waiting={!okrsLocked}
            waitingText="OKRs must be locked before self-assessment."
          >
            {review?.selfFeedback ? (
              <>
                <p className="performance-review-overall">
                  Overall self-rating: <strong>{review.selfOverallRating}/5</strong>
                </p>
                {review.selfCategoryRatings && Object.keys(review.selfCategoryRatings).length > 0 ? (
                  <div className="performance-category-chips">
                    {Object.entries(review.selfCategoryRatings).map(([name, score]) => (
                      <span key={name} className="performance-category-chip">
                        {name}: {score}/5
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="performance-review-feedback">{review.selfFeedback}</p>
                <OkrRatingCards
                  okrs={okrs}
                  ratings={review.selfRatingPerOkr}
                  label="Self score"
                />
              </>
            ) : (
              <p className="stat-sub">Employee has not submitted self-assessment yet.</p>
            )}
          </ReviewSection>

          <ReviewSection
            title="Step 2 — Manager review"
            done={['MANAGER SUBMITTED', 'LOCKED'].includes(status)}
            waiting={status === 'PENDING'}
            waitingText="Waiting for employee self-assessment."
          >
            {mode === 'manager' && status === 'SELF SUBMITTED' ? (
              <div className="perf-goals-stack">
                {review?.selfFeedback ? (
                  <div className="perf-self-summary-card">
                    <p className="perf-goal-eyebrow">Employee self-assessment</p>
                    <p className="perf-self-summary-text">{review.selfFeedback}</p>
                  </div>
                ) : null}
                {okrs.filter((o) => o.id).map((o, idx) => (
                  <GoalCard
                    key={o.id}
                    index={idx}
                    weight={o.weightage}
                    title={o.objective}
                    description={o.keyResult}
                    progress={progressForEntry(review?.selfRatingPerOkr, o.id!, 0)}
                    selfRating={ratingFor(review?.selfRatingPerOkr, o.id!)}
                    selfFeedback={feedbackForEntry(review?.selfRatingPerOkr, o.id!)}
                    expanded={expandedOkr === o.id}
                    onToggleExpand={() => setExpandedOkr((c) => (c === o.id ? null : o.id!))}
                    managerRating={mgrRatings[o.id!] ?? null}
                    editableManagerRating
                    onManagerRatingChange={(v) => setMgrRatings((p) => ({ ...p, [o.id!]: v }))}
                    managerFeedback={mgrFeedbackPerOkr[o.id!] || ''}
                    showManagerColumn
                  />
                ))}
                <div className="perf-overall-card">
                  <p className="perf-goal-eyebrow">Overall manager feedback</p>
                  <textarea
                    className="perf-goal-feedback-input"
                    rows={3}
                    value={mgrFeedback}
                    onChange={(e) => setMgrFeedback(e.target.value)}
                    placeholder="Summary feedback for this quarter…"
                  />
                  <div className="perf-overall-rating">
                    <span>Your overall rating</span>
                    <RatingButtons value={mgrOverall} onChange={setMgrOverall} />
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => submitManagerReview()}>
                    Submit manager review
                  </button>
                </div>
              </div>
            ) : review?.managerFeedback ? (
              <>
                <p className="performance-review-overall">
                  Manager overall: <strong>{review.managerOverallRating}/5</strong>
                </p>
                <p className="performance-review-feedback">{review.managerFeedback}</p>
                <OkrRatingCards okrs={okrs} ratings={review.managerRatingPerOkr} label="Manager score" />
              </>
            ) : mode === 'admin' && status === 'SELF SUBMITTED' ? (
              <p className="stat-sub">Waiting for manager to submit their review.</p>
            ) : status === 'PENDING' ? (
              <p className="stat-sub">Not started yet.</p>
            ) : null}
          </ReviewSection>

          {mode === 'admin' ? (
            <ReviewSection
              title="Step 3 — Admin final rating"
              done={status === 'LOCKED'}
              waiting={status !== 'MANAGER SUBMITTED' && status !== 'LOCKED'}
              waitingText="Manager review must be submitted before admin final rating."
            >
              {status === 'MANAGER SUBMITTED' ? (
                <>
                  <p className="stat-sub" style={{ marginBottom: 10 }}>
                    Give a binding score for each OKR (max = OKR weightage). Preview total:{' '}
                    <strong>{Math.round(adminScorePreview * 100) / 100}</strong>/100
                  </p>
                  <OkrRatingForm
                    okrs={okrs}
                    ratings={adminRatings}
                    onChange={setAdminRatings}
                    priorRatings={review?.selfRatingPerOkr}
                    priorLabel="Self"
                    secondRatings={review?.managerRatingPerOkr}
                    secondLabel="Manager"
                  />
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => finalizeAdminQuarter()}>
                    Lock quarter & save final score
                  </button>
                </>
              ) : status === 'LOCKED' ? (
                <>
                  <p className="performance-review-overall">
                    Final quarter score: <strong>{review?.adminFinalQuarterScore}</strong>/100
                  </p>
                  <OkrRatingCards okrs={okrs} ratings={review?.adminRatingPerOkr} label="Admin score" />
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => unlockQuarter()}>
                    Unlock quarter
                  </button>
                </>
              ) : null}
            </ReviewSection>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ReviewSection({
  title,
  done,
  waiting,
  waitingText,
  children,
}: {
  title: string;
  done: boolean;
  waiting?: boolean;
  waitingText?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`panel performance-review-section${done ? ' is-done' : ''}`}>
      <div className="performance-review-section-head">
        <h4 className="panel-title">{title}</h4>
        {done ? <StatusBadge status="approved" /> : <StatusBadge status="pending" />}
      </div>
      {waiting ? <p className="stat-sub">{waitingText}</p> : children}
    </section>
  );
}

function OkrRatingCards({
  okrs,
  ratings,
  label,
}: {
  okrs: PerformanceOkr[];
  ratings?: OkrRating[];
  label: string;
}) {
  return (
    <ul className="performance-okr-rating-list">
      {okrs.filter((o) => o.id).map((o, idx) => (
        <li key={o.id} className="performance-okr-rating-card">
          <div className="performance-okr-rating-card-head">
            <span className="performance-okr-card-num">OKR {idx + 1}</span>
            <strong>{o.objective}</strong>
          </div>
          <p className="stat-sub">
            {label}: {ratingFor(ratings, o.id!) ?? '—'} / {o.weightage}
          </p>
        </li>
      ))}
    </ul>
  );
}

function OkrRatingForm({
  okrs,
  ratings,
  onChange,
  priorRatings,
  priorLabel,
  secondRatings,
  secondLabel,
}: {
  okrs: PerformanceOkr[];
  ratings: Record<number, string>;
  onChange: (next: Record<number, string>) => void;
  priorRatings?: OkrRating[];
  priorLabel?: string;
  secondRatings?: OkrRating[];
  secondLabel?: string;
}) {
  return (
    <ul className="performance-okr-rating-list">
      {okrs
        .filter((o) => o.id)
        .map((o, idx) => (
          <li key={o.id} className="performance-okr-rating-card performance-okr-rating-card--form">
            <div className="performance-okr-rating-card-head">
              <span className="performance-okr-card-num">OKR {idx + 1}</span>
              <strong>{o.objective}</strong>
            </div>
            <p className="stat-sub">
              {o.keyResult} · KRA: {o.kra} · KPI: {o.kpi}
            </p>
            <div className="performance-okr-rating-meta">
              {priorLabel ? (
                <span>
                  {priorLabel}: {ratingFor(priorRatings, o.id!) ?? '—'}
                </span>
              ) : null}
              {secondLabel ? (
                <span>
                  {secondLabel}: {ratingFor(secondRatings, o.id!) ?? '—'}
                </span>
              ) : null}
              <span>Max: {o.weightage}</span>
            </div>
            <label className="performance-okr-rating-input">
              <span>Your score</span>
              <input
                type="number"
                min={0}
                max={o.weightage}
                value={ratings[o.id!] ?? ''}
                onChange={(e) => onChange({ ...ratings, [o.id!]: e.target.value })}
              />
            </label>
          </li>
        ))}
    </ul>
  );
}
