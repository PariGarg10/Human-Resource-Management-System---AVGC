import { useCallback, useEffect, useMemo, useState } from 'react';
import { GoalCard } from '@/features/performance/GoalCard';
import { OkrSetupEditor } from '@/features/performance/OkrSetupEditor';
import {
  feedbackForEntry,
  progressForEntry,
  ratingForEntry,
  type OkrRatingEntry,
} from '@/features/performance/goalRatingUtils';
import type { PerformanceOkr } from '@/features/performance/performanceTypes';
import { TeamPerformanceSection } from '@/features/performance/TeamPerformanceSection';
import { RatingButtons } from '@/features/performance/RatingButtons';
import { buildEmployeeHistoryChart } from '@/features/performance/chartSeries';
import { PerformanceLineChart } from '@/features/performance/PerformanceLineChart';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { PortalRole } from '@/lib/portalNav';

type Okr = PerformanceOkr & { clientKey: string; progressPercent?: number };
type Category = { id: number; name: string };

type Review = {
  status: string;
  selfRatingPerOkr?: OkrRatingEntry[];
  selfCategoryRatings?: Record<string, number>;
  selfOverallRating?: number | null;
  selfFeedback?: string | null;
  adminFinalQuarterScore?: number | null;
};

type ManagerReview = Review & {
  managerRatingPerOkr?: OkrRatingEntry[];
  managerFeedbackPerOkr?: OkrRatingEntry[];
  managerOverallRating?: number | null;
  managerFeedback?: string | null;
};

type Annual = {
  q1Score: number | null;
  q2Score: number | null;
  q3Score: number | null;
  q4Score: number | null;
  annualScore: number | null;
  ratingBand: string | null;
  ratingValue: number | null;
  status: string;
};

type HistoryQuarter = {
  year: number;
  quarter: number;
  status: string;
  okrCount: number;
  selfOverallRating: number | null;
  managerOverallRating: number | null;
  finalScore: number | null;
};

type PerfTab = 'kras' | 'self-assessment' | 'manager-review' | 'overall' | 'team';

function normalizeOkr(o: Partial<Okr> & { id?: number; progressPercent?: number }, idx: number): Okr {
  return {
    clientKey: o.clientKey || (o.id != null ? `id-${o.id}` : `idx-${idx}`),
    objective: o.objective || '',
    keyResult: o.keyResult || '',
    kra: o.kra || '',
    kpi: o.kpi || '',
    weightage: Number(o.weightage) || 0,
    progressPercent: Number(o.progressPercent) || 0,
    id: o.id,
    status: o.status,
  };
}

function uiStatusLabel(status: string) {
  if (status === 'SELF SUBMITTED') return 'Self review';
  if (status === 'MANAGER SUBMITTED') return 'Manager review';
  if (status === 'LOCKED') return 'Completed';
  return 'Not started';
}

export function PerformancePortal({
  portalRole,
  initialTab,
}: {
  portalRole: PortalRole;
  initialTab?: PerfTab;
}) {
  const isManager = portalRole === 'manager';
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [tab, setTab] = useState<PerfTab>(initialTab || 'kras');
  const [loading, setLoading] = useState(true);

  const [okrs, setOkrs] = useState<Okr[]>([]);
  const [okrsLocked, setOkrsLocked] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [managerReview, setManagerReview] = useState<ManagerReview | null>(null);
  const [annual, setAnnual] = useState<Annual | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [history, setHistory] = useState<{ quarters: HistoryQuarter[]; annuals: Annual[] } | null>(null);

  const [selfRatings, setSelfRatings] = useState<Record<number, number>>({});
  const [selfProgress, setSelfProgress] = useState<Record<number, number>>({});
  const [selfFeedbackPerOkr, setSelfFeedbackPerOkr] = useState<Record<number, string>>({});
  const [selfCategories, setSelfCategories] = useState<Record<string, number>>({});
  const [selfOverall, setSelfOverall] = useState(3);
  const [selfSummary, setSelfSummary] = useState('');
  const [expandedOkr, setExpandedOkr] = useState<number | null>(null);

  const weightTotal = useMemo(() => okrs.reduce((s, o) => s + (Number(o.weightage) || 0), 0), [okrs]);

  const loadMy = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{
        okrs: Okr[];
        okrsLocked: boolean;
        review: Review | null;
        managerReview: ManagerReview | null;
        annual: Annual | null;
        categories: Category[];
      }>(`/api/performance/my?year=${year}&quarter=${quarter}`);
      const normalized = (data.okrs || []).map((o, i) => normalizeOkr(o as Okr, i));
      setOkrs(normalized);
      setOkrsLocked(data.okrsLocked);
      setReview(data.review);
      setManagerReview(data.managerReview);
      setAnnual(data.annual);
      setCategories(data.categories || []);

      const ratings: Record<number, number> = {};
      const progress: Record<number, number> = {};
      const feedback: Record<number, string> = {};
      for (const o of normalized) {
        if (!o.id) continue;
        const r = ratingForEntry(data.review?.selfRatingPerOkr, o.id);
        if (r != null) ratings[o.id] = r;
        progress[o.id] = progressForEntry(data.review?.selfRatingPerOkr, o.id, o.progressPercent || 0);
        feedback[o.id] = feedbackForEntry(data.review?.selfRatingPerOkr, o.id);
      }
      setSelfRatings(ratings);
      setSelfProgress(progress);
      setSelfFeedbackPerOkr(feedback);
      setSelfOverall(data.review?.selfOverallRating ?? 3);
      setSelfSummary(data.review?.selfFeedback || '');
      setSelfCategories((data.review?.selfCategoryRatings as Record<string, number>) || {});
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Load failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [year, quarter]);

  const loadHistory = useCallback(async () => {
    try {
      const data = await api<{ quarters: HistoryQuarter[]; annuals: Annual[] }>('/api/performance/history');
      setHistory(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'History load failed', 'error');
    }
  }, []);

  useEffect(() => {
    void loadMy();
  }, [loadMy]);

  useEffect(() => {
    if (tab === 'overall') void loadHistory();
  }, [tab, loadHistory]);

  function updateOkr(idx: number, patch: Partial<Okr>) {
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

  async function submitOkrs() {
    if (okrs.length === 0) {
      toast('Add at least one KRA / goal', 'error');
      return;
    }
    if (Math.abs(weightTotal - 100) > 0.01) {
      toast(`Weights must total 100 (current: ${weightTotal})`, 'error');
      return;
    }
    try {
      await api('/api/performance/okrs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, quarter, okrs }),
      });
      toast('KRAs submitted to manager', 'success');
      await loadMy();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  }

  async function submitSelfAssessment() {
    const selfRatingPerOkr = okrs
      .filter((o) => o.id)
      .map((o) => ({
        okrId: o.id!,
        rating: selfRatings[o.id!] || 0,
        progress: selfProgress[o.id!] ?? o.progressPercent ?? 0,
        feedback: selfFeedbackPerOkr[o.id!] || '',
      }));
    try {
      await api('/api/performance/reviews/self', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          quarter,
          selfRatingPerOkr,
          selfCategoryRatings: selfCategories,
          selfOverallRating: selfOverall,
          selfFeedback: selfSummary,
        }),
      });
      toast('Self assessment submitted', 'success');
      await loadMy();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  }

  const selfSubmitted = Boolean(review?.status && review.status !== 'PENDING');
  const canSelfAssess = okrsLocked && !selfSubmitted;
  const managerVisible = Boolean(
    managerReview?.managerRatingPerOkr?.length ||
      managerReview?.managerOverallRating != null ||
      managerReview?.status === 'MANAGER SUBMITTED' ||
      managerReview?.status === 'LOCKED'
  );

  const historyChart = useMemo(
    () => buildEmployeeHistoryChart(history?.quarters || []),
    [history?.quarters]
  );

  const tabs: { id: PerfTab; label: string }[] = [
    { id: 'kras', label: 'KRAs' },
    { id: 'self-assessment', label: 'Self assessment' },
    { id: 'manager-review', label: 'Manager review' },
    { id: 'overall', label: 'Overall performance' },
  ];
  if (isManager) tabs.push({ id: 'team', label: 'Team performance' });

  return (
    <div className="panel performance-panel perf-portal">
      <div className="perf-portal-head">
        <div>
          <h2 className="panel-title">Performance</h2>
          <p className="stat-sub">Q{quarter} {year} · KRAs, quarterly self assessment, manager review & history</p>
        </div>
        <div className="perf-period-controls">
          <label>
            Year
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </label>
          <label>
            Quarter
            <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>Q{q}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="perf-main-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`perf-main-tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'team' && isManager ? (
        <TeamPerformanceSection year={year} quarter={quarter} />
      ) : loading ? (
        <p className="stat-sub">Loading…</p>
      ) : (
        <>
          {tab === 'kras' ? (
            <OkrSetupEditor
              okrs={okrs}
              okrsLocked={okrsLocked}
              isManagerView={false}
              weightTotal={weightTotal}
              onChange={updateOkr}
              onAdd={addOkr}
              onRemove={removeOkr}
              onSubmit={() => submitOkrs()}
            />
          ) : null}

          {tab === 'self-assessment' ? (
            <div className="perf-goals-stack">
              {!okrsLocked ? (
                <p className="performance-okr-empty">
                  Self assessment opens once your manager approves and locks your KRAs for this quarter.
                </p>
              ) : selfSubmitted ? (
                <>
                  <div className="perf-self-summary-card">
                    <p className="perf-goal-eyebrow">Employee self-assessment</p>
                    {review?.selfFeedback ? (
                      <p className="perf-self-summary-text">{review.selfFeedback}</p>
                    ) : (
                      <p className="stat-sub">Submitted — status: {review?.status}</p>
                    )}
                    <StatusBadge status={review?.status === 'LOCKED' ? 'approved' : 'pending'} />
                  </div>
                  {okrs.filter((o) => o.id).map((o, idx) => (
                    <GoalCard
                      key={o.id}
                      index={idx}
                      weight={o.weightage}
                      title={o.objective}
                      description={o.keyResult}
                      progress={progressForEntry(review?.selfRatingPerOkr, o.id!, o.progressPercent || 0)}
                      selfRating={ratingForEntry(review?.selfRatingPerOkr, o.id!)}
                      selfFeedback={feedbackForEntry(review?.selfRatingPerOkr, o.id!)}
                      managerRating={ratingForEntry(managerReview?.managerRatingPerOkr, o.id!)}
                      managerFeedback={feedbackForEntry(managerReview?.managerFeedbackPerOkr, o.id!)}
                      managerStatus={managerVisible ? undefined : 'Awaiting manager'}
                      showManagerColumn
                    />
                  ))}
                </>
              ) : canSelfAssess ? (
                <>
                  {okrs.filter((o) => o.id).map((o, idx) => (
                    <GoalCard
                      key={o.id}
                      index={idx}
                      weight={o.weightage}
                      title={o.objective}
                      description={o.keyResult}
                      progress={selfProgress[o.id!] ?? o.progressPercent ?? 0}
                      editableProgress
                      onProgressChange={(v) => setSelfProgress((p) => ({ ...p, [o.id!]: v }))}
                      selfRating={selfRatings[o.id!] ?? null}
                      editableSelfRating
                      onSelfRatingChange={(v) => setSelfRatings((p) => ({ ...p, [o.id!]: v }))}
                      selfFeedback={selfFeedbackPerOkr[o.id!] || ''}
                      editableSelfFeedback
                      onSelfFeedbackChange={(v) => setSelfFeedbackPerOkr((p) => ({ ...p, [o.id!]: v }))}
                      managerStatus="Awaiting manager"
                      showManagerColumn
                    />
                  ))}
                  <div className="perf-competencies-card">
                    <p className="perf-goal-eyebrow">Competencies</p>
                    <div className="perf-competency-grid">
                      {categories.map((c) => (
                        <label key={c.id} className="perf-competency-row">
                          <span>{c.name}</span>
                          <RatingButtons
                            value={selfCategories[c.name] ?? null}
                            onChange={(v) => setSelfCategories((p) => ({ ...p, [c.name]: v }))}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="perf-overall-card">
                    <p className="perf-goal-eyebrow">Overall summary</p>
                    <textarea
                      className="perf-goal-feedback-input"
                      rows={3}
                      placeholder="High-level reflection for this quarter…"
                      value={selfSummary}
                      onChange={(e) => setSelfSummary(e.target.value)}
                    />
                    <div className="perf-overall-rating">
                      <span>Overall rating</span>
                      <RatingButtons value={selfOverall} onChange={setSelfOverall} />
                    </div>
                    <button type="button" className="btn btn-primary" onClick={() => submitSelfAssessment()}>
                      Submit self assessment
                    </button>
                  </div>
                </>
              ) : (
                <p className="stat-sub">Add and submit KRAs first.</p>
              )}
            </div>
          ) : null}

          {tab === 'manager-review' ? (
            <div className="perf-goals-stack">
              {!managerVisible ? (
                <p className="performance-okr-empty">
                  Manager review will appear here after your manager completes the quarterly review.
                </p>
              ) : (
                <>
                  {managerReview?.managerFeedback ? (
                    <div className="perf-self-summary-card">
                      <p className="perf-goal-eyebrow">Manager summary</p>
                      <p className="perf-self-summary-text">{managerReview.managerFeedback}</p>
                      {managerReview.managerOverallRating != null ? (
                        <p className="stat-sub">Overall rating: {managerReview.managerOverallRating}/5</p>
                      ) : null}
                    </div>
                  ) : null}
                  {okrs.filter((o) => o.id).map((o, idx) => (
                    <GoalCard
                      key={o.id}
                      index={idx}
                      weight={o.weightage}
                      title={o.objective}
                      description={o.keyResult}
                      progress={progressForEntry(review?.selfRatingPerOkr, o.id!, o.progressPercent || 0)}
                      selfRating={ratingForEntry(review?.selfRatingPerOkr, o.id!)}
                      selfFeedback={feedbackForEntry(review?.selfRatingPerOkr, o.id!)}
                      managerRating={ratingForEntry(managerReview?.managerRatingPerOkr, o.id!)}
                      managerFeedback={feedbackForEntry(managerReview?.managerFeedbackPerOkr, o.id!)}
                      expanded={expandedOkr === o.id}
                      onToggleExpand={() => setExpandedOkr((cur) => (cur === o.id ? null : o.id!))}
                      showManagerColumn
                    />
                  ))}
                  {review?.adminFinalQuarterScore != null ? (
                    <p className="stat-sub">Final quarter score: <strong>{review.adminFinalQuarterScore}</strong> / 100</p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {tab === 'overall' ? (
            <div className="perf-history">
              <div className="perf-history-current">
                <h3 className="panel-title">Q{quarter} {year}</h3>
                <p className="stat-sub">Status: {uiStatusLabel(review?.status || 'PENDING')}</p>
                {review?.adminFinalQuarterScore != null ? (
                  <p>Quarter score: <strong>{review.adminFinalQuarterScore}</strong> / 100</p>
                ) : null}
                {annual ? (
                  <div className="perf-annual-grid">
                    <div><span>Q1</span><strong>{annual.q1Score ?? '—'}</strong></div>
                    <div><span>Q2</span><strong>{annual.q2Score ?? '—'}</strong></div>
                    <div><span>Q3</span><strong>{annual.q3Score ?? '—'}</strong></div>
                    <div><span>Q4</span><strong>{annual.q4Score ?? '—'}</strong></div>
                    <div className="perf-annual-total"><span>Annual</span><strong>{annual.annualScore ?? '—'}</strong></div>
                    <div><span>Band</span><strong>{annual.ratingBand ?? '—'}</strong></div>
                  </div>
                ) : null}
              </div>
              <PerformanceLineChart
                title="Performance history"
                subtitle="Your quarterly self, manager, and final scores over time"
                labels={historyChart.labels}
                series={historyChart.series}
              />
              {history?.quarters?.length ? (
                <div className="perf-team-table-wrap">
                  <table className="data-table perf-team-table">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Goals</th>
                        <th>Status</th>
                        <th>Self</th>
                        <th>Manager</th>
                        <th>Final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.quarters.map((q) => (
                        <tr key={`${q.year}-${q.quarter}`}>
                          <td>Q{q.quarter} {q.year}</td>
                          <td>{q.okrCount}</td>
                          <td>{uiStatusLabel(q.status)}</td>
                          <td>{q.selfOverallRating ?? '—'}</td>
                          <td>{q.managerOverallRating ?? '—'}</td>
                          <td>{q.finalScore ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="stat-sub">No prior performance history yet.</p>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
