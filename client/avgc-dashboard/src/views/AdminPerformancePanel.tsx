import { useCallback, useEffect, useState } from 'react';
import { EmployeePerformanceWorkspace } from '@/features/performance/EmployeePerformanceWorkspace';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

type Band = {
  id?: number;
  bandLabel: string;
  minScore: number;
  maxScore: number;
  ratingValue: number;
  incrementPercent: number;
  bonusPercent: number;
};

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

type OverviewEmployee = {
  employeeId: number;
  name: string;
  designation: string;
  department: string;
  managerName: string;
  okrCount: number;
  uiStatus: string;
  reviewStatus: string;
  finalRating: number | null;
  finalRatingLabel?: string | null;
};

type Overview = {
  cycleLabel: string;
  cycle?: {
    initialized: boolean;
    status: 'ACTIVE' | 'STOPPED' | null;
    initializedAt?: string | null;
    stoppedAt?: string | null;
  };
  completionPercent: number;
  totalReviews: number;
  awaitingManagers: number;
  notStarted: number;
  statusBreakdown: { key: string; label: string; count: number; percent: number }[];
  ratingDistribution: Record<string, number>;
  employees: OverviewEmployee[];
};

function statusPill(uiStatus: string) {
  const map: Record<string, string> = {
    not_started: 'perf-status-pill--muted',
    self_review: 'perf-status-pill--warn',
    manager_review: 'perf-status-pill--accent',
    completed: 'perf-status-pill--done',
  };
  const labels: Record<string, string> = {
    not_started: 'Not started',
    self_review: 'Self review',
    manager_review: 'Manager review',
    completed: 'Completed',
  };
  return (
    <span className={`perf-status-pill ${map[uiStatus] || 'perf-status-pill--muted'}`}>
      {labels[uiStatus] || uiStatus}
    </span>
  );
}

export function AdminPerformancePanel() {
  const [tab, setTab] = useState<'overview' | 'config' | 'annual'>('overview');
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [loading, setLoading] = useState(true);

  const [bands, setBands] = useState<Band[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string; active: boolean }[]>([]);
  const [qWeights, setQWeights] = useState({ q1: 25, q2: 25, q3: 25, q4: 25 });
  const [newCategory, setNewCategory] = useState('');

  const [overview, setOverview] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<OverviewEmployee | null>(null);

  function setBandNumber(index: number, field: keyof Pick<Band, 'minScore' | 'maxScore' | 'ratingValue' | 'incrementPercent' | 'bonusPercent'>, raw: string) {
    const parsed = Number(raw);
    const value = Number.isFinite(parsed) ? parsed : 0;
    setBands((prev) =>
      prev.map((band, i) => {
        if (i !== index) return band;
        if (field === 'ratingValue') return { ...band, [field]: clampNumber(value, 0, 5) };
        if (field === 'incrementPercent' || field === 'bonusPercent') {
          return { ...band, [field]: clampNumber(value, 0, 100) };
        }
        return { ...band, [field]: clampNumber(value, 0, 100) };
      })
    );
  }

  const loadConfig = useCallback(async () => {
    const data = await api<{
      bands: Band[];
      categories: { id: number; name: string; active: boolean }[];
      quarterWeights: { year: number; q1_weight: number; q2_weight: number; q3_weight: number; q4_weight: number }[];
    }>('/api/performance/admin/config');
    setBands(data.bands || []);
    setCategories(data.categories || []);
    const w = data.quarterWeights?.find((x) => x.year === year);
    if (w) {
      setQWeights({
        q1: Number(w.q1_weight),
        q2: Number(w.q2_weight),
        q3: Number(w.q3_weight),
        q4: Number(w.q4_weight),
      });
    }
  }, [year]);

  const loadOverview = useCallback(async () => {
    const data = await api<Overview>(`/api/performance/admin/overview?year=${year}&quarter=${quarter}`);
    setOverview(data);
  }, [year, quarter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'overview') await loadOverview();
      else if (tab === 'config' || tab === 'annual') await loadConfig();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Load failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, loadOverview, loadConfig]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function saveBands() {
    try {
      await api('/api/performance/admin/config/bands', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bands }),
      });
      toast('Rating bands saved', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  }

  async function saveWeights() {
    try {
      await api('/api/performance/admin/config/quarter-weights', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, ...qWeights }),
      });
      toast('Quarter weights saved', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  }

  async function addCategory() {
    if (!newCategory.trim()) return;
    try {
      await api('/api/performance/admin/config/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategory.trim() }),
      });
      setNewCategory('');
      await loadConfig();
      toast('Category added', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  }

  async function removeCategory(id: number, name: string) {
    if (!window.confirm(`Remove "${name}" from self-assessment? Employees will no longer rate this competency.`)) return;
    try {
      await api(`/api/performance/admin/config/categories/${id}`, { method: 'DELETE' });
      await loadConfig();
      toast('Category removed', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  }

  async function restoreCategory(id: number) {
    try {
      await api(`/api/performance/admin/config/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      });
      await loadConfig();
      toast('Category restored', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  }

  const activeCategories = categories.filter((c) => c.active);
  const removedCategories = categories.filter((c) => !c.active);

  async function startCycle() {
    try {
      const data = await api<{ message: string }>('/api/performance/admin/cycles/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, quarter }),
      });
      toast(data.message, 'success');
      await loadOverview();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  }

  async function stopCycle() {
    if (!window.confirm(`Stop Q${quarter} ${year} cycle? Employees will not be able to progress until you re-initialize.`)) return;
    try {
      const data = await api<{ message: string }>('/api/performance/admin/cycles/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, quarter }),
      });
      toast(data.message, 'success');
      await loadOverview();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  }

  async function deleteCycle() {
    if (
      !window.confirm(
        `Delete Q${quarter} ${year} cycle? This removes all review rows and OKRs for this quarter. This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      const data = await api<{ message: string }>(
        `/api/performance/admin/cycles?year=${year}&quarter=${quarter}`,
        { method: 'DELETE' }
      );
      toast(data.message, 'success');
      await loadOverview();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  }

  async function computeAnnual() {
    try {
      const data = await api<{ message: string }>(`/api/performance/admin/annual/${year}/compute`, { method: 'POST' });
      toast(data.message, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  }

  async function finalizeAnnual() {
    if (!window.confirm('Finalize all annual appraisals for this year?')) return;
    try {
      await api(`/api/performance/admin/annual/${year}/finalize`, { method: 'POST' });
      toast('Annual appraisals finalised', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  }

  function downloadSheet() {
    window.open(`/api/performance/admin/export/${year}`, '_blank');
  }

  const maxDist = Math.max(1, ...Object.values(overview?.ratingDistribution || {}));
  const cycleInitialized = Boolean(overview?.cycle?.initialized);
  const cycleStopped = overview?.cycle?.status === 'STOPPED';

  return (
    <div className="panel admin-performance perf-admin">
      <div className="perf-portal-head">
        <div>
          <h2 className="panel-title">Performance</h2>
          <p className="stat-sub">Quarterly cycles, org-wide reviews, reports & year-end ratings</p>
        </div>
        <div className="perf-period-controls">
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
            {[1, 2, 3, 4].map((q) => (
              <option key={q} value={q}>Q{q}</option>
            ))}
          </select>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => load()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="perf-main-tabs">
        {(['overview', 'config', 'annual'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`perf-main-tab${tab === t ? ' is-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'overview' ? 'Cycle dashboard' : t === 'config' ? 'Settings' : 'Year-end'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="stat-sub">Loading…</p>
      ) : tab === 'overview' && overview ? (
        selected ? (
          <EmployeePerformanceWorkspace
            mode="admin"
            employeeId={selected.employeeId}
            employeeName={selected.name}
            year={year}
            quarter={quarter}
            onBack={() => {
              setSelected(null);
              loadOverview().catch(() => {});
            }}
            onUpdated={() => loadOverview().catch(() => {})}
          />
        ) : (
          <div className="perf-admin-dashboard">
            <div className="perf-admin-kpi-row">
              <div className="perf-admin-kpi perf-admin-kpi--accent">
                <strong>{overview.completionPercent}%</strong>
                <span>{overview.cycleLabel}</span>
              </div>
              <div className="perf-admin-kpi">
                <strong>{overview.totalReviews}</strong>
                <span>Total reviews · Org-wide</span>
              </div>
              <div className="perf-admin-kpi">
                <strong>{overview.awaitingManagers}</strong>
                <span>Awaiting managers · 180° pending</span>
              </div>
              <div className="perf-admin-kpi">
                <strong>{overview.notStarted}</strong>
                <span>Not started · Needs nudge</span>
              </div>
            </div>

            <div className="perf-admin-bento">
              <div className="perf-admin-bento-main panel">
                <div className="perf-admin-table-head">
                  <p className="perf-goal-eyebrow">All employees · {overview.cycleLabel}</p>
                  <span className="stat-sub">{overview.totalReviews} reviews</span>
                </div>
                <div className="perf-team-table-wrap">
                  <table className="data-table perf-team-table perf-admin-employee-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Manager</th>
                        <th>Status</th>
                        <th>Goals</th>
                        <th>Final rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.employees.map((e) => (
                        <tr key={e.employeeId} className="perf-admin-row-click" onClick={() => setSelected(e)}>
                          <td>
                            <strong>{e.name}</strong>
                            <div className="stat-sub">{e.designation || e.department}</div>
                          </td>
                          <td>{e.managerName}</td>
                          <td>{statusPill(e.uiStatus)}</td>
                          <td>{e.okrCount}</td>
                          <td>
                            {e.finalRatingLabel ? (
                              <span className="perf-final-rating-pill">{e.finalRatingLabel}</span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="perf-admin-actions">
                  {cycleInitialized ? (
                    <>
                      <span
                        className={`perf-cycle-status-pill${cycleStopped ? ' perf-cycle-status-pill--stopped' : ''}`}
                      >
                        {cycleStopped ? 'Stopped' : 'Initialized'}
                      </span>
                      {!cycleStopped ? (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => stopCycle()}>
                          Stop cycle
                        </button>
                      ) : null}
                      <button type="button" className="btn btn-outline btn-sm perf-cycle-delete-btn" onClick={() => deleteCycle()}>
                        Delete cycle
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => startCycle()}>
                      Initialize Q{quarter} cycle
                    </button>
                  )}
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadSheet()}>
                    Download report
                  </button>
                </div>
              </div>

              <div className="perf-admin-bento-side">
                <div className="panel perf-admin-side-card">
                  <p className="perf-goal-eyebrow">Status breakdown</p>
                  <ul className="perf-status-breakdown">
                    {overview.statusBreakdown.map((s) => (
                      <li key={s.key}>
                        <div className="perf-status-breakdown-row">
                          <span>{s.label}</span>
                          <span>{s.count} · {s.percent}%</span>
                        </div>
                        <div className="perf-status-breakdown-bar">
                          <span className={`perf-status-bar-fill perf-status-bar-fill--${s.key}`} style={{ width: `${s.percent}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="panel perf-admin-side-card">
                  <p className="perf-goal-eyebrow">Rating distribution</p>
                  <p className="stat-sub">Final ratings across completed reviews</p>
                  <div className="perf-rating-dist">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div key={n} className="perf-rating-dist-col">
                        <div className="perf-rating-dist-bar-wrap">
                          <div
                            className="perf-rating-dist-bar"
                            style={{ height: `${((overview.ratingDistribution[String(n)] || 0) / maxDist) * 100}%` }}
                          />
                        </div>
                        <span>{n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      ) : tab === 'config' ? (
        <>
          <div className="panel" style={{ marginBottom: 14 }}>
            <h3 className="panel-title">Rating bands</h3>
            <p className="stat-sub perf-settings-help">
              Map year-end scores (0–100) to a rating label and 1–5 value. When you run{' '}
              <strong>Compute annual ratings</strong>, each employee&apos;s annual score is matched to a band.
              Bonus % is a reference value for year-end variable bonus as % of annual CTC.
            </p>
            <div className="perf-band-header stat-sub">
              <span>Band</span>
              <span>Min</span>
              <span>Max</span>
              <span>Rating (1–5)</span>
              <span>Bonus %</span>
            </div>
            {bands.map((b, i) => (
              <div key={i} className="perf-band-row exit-kt-add">
                <input value={b.bandLabel} onChange={(e) => setBands((p) => p.map((x, j) => (j === i ? { ...x, bandLabel: e.target.value } : x)))} placeholder="Label" />
                <input type="number" min={0} max={100} value={b.minScore} onChange={(e) => setBandNumber(i, 'minScore', e.target.value)} placeholder="Min" />
                <input type="number" min={0} max={100} value={b.maxScore} onChange={(e) => setBandNumber(i, 'maxScore', e.target.value)} placeholder="Max" />
                <input type="number" min={0} max={5} value={b.ratingValue} onChange={(e) => setBandNumber(i, 'ratingValue', e.target.value)} placeholder="Rating" />
                <input type="number" min={0} max={100} value={b.bonusPercent} onChange={(e) => setBandNumber(i, 'bonusPercent', e.target.value)} placeholder="Bonus %" />
              </div>
            ))}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => saveBands()}>
              Save bands
            </button>
          </div>

          <div className="panel" style={{ marginBottom: 14 }}>
            <h3 className="panel-title">Self-assessment categories</h3>
            <p className="stat-sub perf-settings-help">
              Competencies employees rate (1–5) during quarterly self-assessment, alongside their KRA goals.
            </p>
            {activeCategories.length === 0 ? (
              <p className="stat-sub">No active categories. Add one below.</p>
            ) : (
              <ul className="perf-category-list">
                {activeCategories.map((c) => (
                  <li key={c.id} className="perf-category-row">
                    <span>{c.name}</span>
                    <button type="button" className="btn btn-outline btn-sm perf-category-remove" onClick={() => removeCategory(c.id, c.name)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {removedCategories.length > 0 ? (
              <div className="perf-category-removed">
                <p className="perf-goal-eyebrow">Removed</p>
                <ul className="perf-category-list">
                  {removedCategories.map((c) => (
                    <li key={c.id} className="perf-category-row perf-category-row--muted">
                      <span>{c.name}</span>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => restoreCategory(c.id)}>
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="exit-kt-add">
              <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category" />
              <button type="button" className="btn btn-outline btn-sm" onClick={() => addCategory()}>
                Add
              </button>
            </div>
          </div>

          <div className="panel">
            <h3 className="panel-title">Annual quarter weights (%)</h3>
            <p className="stat-sub perf-settings-help">
              How much each locked quarter contributes to the year-end annual score (must total 100). Example: equal
              25/25/25/25, or weight Q4 more heavily if the last quarter matters most for your org.
            </p>
            <div className="exit-kt-add">
              <input type="number" value={qWeights.q1} onChange={(e) => setQWeights((p) => ({ ...p, q1: Number(e.target.value) }))} placeholder="Q1" />
              <input type="number" value={qWeights.q2} onChange={(e) => setQWeights((p) => ({ ...p, q2: Number(e.target.value) }))} placeholder="Q2" />
              <input type="number" value={qWeights.q3} onChange={(e) => setQWeights((p) => ({ ...p, q3: Number(e.target.value) }))} placeholder="Q3" />
              <input type="number" value={qWeights.q4} onChange={(e) => setQWeights((p) => ({ ...p, q4: Number(e.target.value) }))} placeholder="Q4" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => saveWeights()}>
                Save weights
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="panel">
          <h3 className="panel-title">Year-end final rating</h3>
          <p className="stat-sub">Compute annual scores after all 4 quarters are locked, then finalise.</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => computeAnnual()}>
            Compute annual ratings
          </button>
          <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: 8 }} onClick={() => finalizeAnnual()}>
            Finalise year
          </button>
          <button type="button" className="btn btn-outline btn-sm" style={{ marginLeft: 8 }} onClick={() => downloadSheet()}>
            Download Excel
          </button>
        </div>
      )}
    </div>
  );
}
