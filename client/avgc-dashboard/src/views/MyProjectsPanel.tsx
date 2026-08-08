import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

type EfficiencyProject = { id: number; name: string };

type TaskBaseline = {
  id: number;
  task_name: string;
  version_label: string;
  unit_label: string;
  calc_type: string;
};

type Tab = 'projects' | 'log-output';

export function MyProjectsPanel() {
  const [tab, setTab] = useState<Tab>('projects');
  const [projects, setProjects] = useState<EfficiencyProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProject, setActiveProject] = useState<EfficiencyProject | null>(null);
  const [baselines, setBaselines] = useState<TaskBaseline[]>([]);
  const [taskName, setTaskName] = useState('');
  const [versionLabel, setVersionLabel] = useState('');
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [outputQty, setOutputQty] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingBaselines, setLoadingBaselines] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ projects: EfficiencyProject[] }>('/api/efficiency-projects');
      setProjects(data.projects || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load projects', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects().catch(() => {});
  }, [loadProjects]);

  const openProject = useCallback(async (project: EfficiencyProject) => {
    setActiveProject(project);
    setTaskName('');
    setVersionLabel('');
    setOutputQty('');
    setRemarks('');
    setLoadingBaselines(true);
    try {
      const data = await api<{ baselines: TaskBaseline[] }>(`/api/task-baselines/${project.id}`);
      setBaselines(data.baselines || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load tasks', 'error');
      setBaselines([]);
    } finally {
      setLoadingBaselines(false);
    }
  }, []);

  const taskOptions = useMemo(() => {
    const names = new Set<string>();
    for (const b of baselines) names.add(b.task_name);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [baselines]);

  const versionOptions = useMemo(() => {
    if (!taskName) return [];
    const versions = baselines
      .filter((b) => b.task_name === taskName)
      .map((b) => b.version_label || '');
    return [...new Set(versions)].sort((a, b) => a.localeCompare(b));
  }, [baselines, taskName]);

  const selectedBaseline = useMemo(
    () =>
      baselines.find(
        (b) => b.task_name === taskName && (b.version_label || '') === (versionLabel || '')
      ) || null,
    [baselines, taskName, versionLabel]
  );

  function openLogForProject(project: EfficiencyProject) {
    setTab('log-output');
    openProject(project).catch(() => {});
  }

  async function submitLog() {
    if (!activeProject || !selectedBaseline) {
      toast('Select task and version', 'error');
      return;
    }
    const qty = Number(outputQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast('Quantity must be greater than 0', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api('/api/work-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          taskBaselineId: selectedBaseline.id,
          logDate,
          actualOutputQty: qty,
          remarks: remarks.trim() || undefined,
        }),
      });
      toast('Work log submitted for manager approval', 'success');
      setActiveProject(null);
      setOutputQty('');
      setRemarks('');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Submit failed', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const tabBar = (
    <div className="filters-inline" style={{ marginBottom: 16 }}>
      <button
        type="button"
        className={`btn btn-sm ${tab === 'projects' ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => setTab('projects')}
      >
        My projects
      </button>
      <button
        type="button"
        className={`btn btn-sm ${tab === 'log-output' ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => setTab('log-output')}
      >
        Log output
      </button>
    </div>
  );

  const projectTable =
    loading ? (
      <p className="stat-sub">Loading projects…</p>
    ) : projects.length === 0 ? (
      <p className="stat-sub">
        No efficiency projects configured yet. Ask your admin or manager to add projects and task standards.
      </p>
    ) : tab === 'log-output' ? (
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td>
                  <button
                    type="button"
                    className="btn btn-link"
                    style={{ padding: 0, fontWeight: 600 }}
                    onClick={() => openProject(project)}
                  >
                    {project.name}
                  </button>
                </td>
                <td>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => openProject(project)}>
                    Log output
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Project</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td>
                  <button
                    type="button"
                    className="btn btn-link"
                    style={{ padding: 0, fontWeight: 600 }}
                    onClick={() => openLogForProject(project)}
                  >
                    {project.name}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="stat-sub" style={{ marginTop: 12 }}>
          Select a project to log output, or switch to the Log output tab.
        </p>
      </div>
    );

  return (
    <div className="panel panel--scroll">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">My projects</h2>
          <p className="stat-sub">
            View assigned projects and log daily output. Your manager will approve before it counts toward efficiency.
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => loadProjects().catch(() => {})}>
          Refresh
        </button>
      </div>

      {tabBar}
      {projectTable}

      {activeProject ? (
        <div className="manager-modal-backdrop" role="presentation" onClick={() => setActiveProject(null)}>
          <div
            className="manager-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-log-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="manager-modal-head">
              <h3 id="work-log-modal-title">{activeProject.name}</h3>
              <button type="button" className="manager-modal-close" aria-label="Close" onClick={() => setActiveProject(null)}>
                ×
              </button>
            </div>
            <div className="manager-modal-body">
              {loadingBaselines ? (
                <p className="stat-sub">Loading tasks…</p>
              ) : baselines.length === 0 ? (
                <p className="stat-sub">No task baselines for this project yet.</p>
              ) : (
                <>
                  <label className="form-group">
                    Date
                    <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
                  </label>
                  <label className="form-group">
                    Task
                    <select
                      value={taskName}
                      onChange={(e) => {
                        setTaskName(e.target.value);
                        setVersionLabel('');
                      }}
                    >
                      <option value="">Select…</option>
                      {taskOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-group">
                    Version
                    <select
                      value={versionLabel}
                      onChange={(e) => setVersionLabel(e.target.value)}
                      disabled={!taskName}
                    >
                      <option value="">Select…</option>
                      {versionOptions.map((version) => (
                        <option key={version || '(default)'} value={version}>
                          {version || '(no version label)'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-group">
                    Quantity{selectedBaseline?.unit_label ? ` (${selectedBaseline.unit_label})` : ''}
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={outputQty}
                      onChange={(e) => setOutputQty(e.target.value)}
                      placeholder="Enter quantity"
                    />
                  </label>
                  <label className="form-group">
                    Remarks
                    <textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Optional notes for your manager"
                      rows={3}
                    />
                  </label>
                </>
              )}
            </div>
            <div className="manager-modal-foot">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveProject(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={submitting || !selectedBaseline || baselines.length === 0}
                onClick={() => submitLog()}
              >
                {submitting ? 'Submitting…' : 'Submit for approval'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
