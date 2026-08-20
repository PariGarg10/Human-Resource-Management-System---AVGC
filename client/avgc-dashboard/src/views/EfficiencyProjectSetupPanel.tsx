import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

type EfficiencyProject = { id: number; name: string };

type TaskBaseline = {
  id: number;
  project_id: number;
  task_name: string;
  version_label: string;
  unit_label: string;
  standard_output_qty: number | null;
  standard_hours: number | null;
  calc_type: 'rate_based' | 'weight_based';
  manhours_per_unit: number;
  total_actual_manhours?: number;
  work_log_count?: number;
};

type BaselineForm = {
  id: number | null;
  taskName: string;
  versionLabel: string;
  unitLabel: string;
  calcType: 'rate_based' | 'weight_based';
  standardHours: string;
  standardOutputQty: string;
  manhoursPerUnit: string;
};

const emptyForm = (): BaselineForm => ({
  id: null,
  taskName: '',
  versionLabel: '',
  unitLabel: 'unit',
  calcType: 'rate_based',
  standardHours: '',
  standardOutputQty: '',
  manhoursPerUnit: '',
});

type Props = {
  title?: string;
  subtitle?: string;
  /** standards = projects + task table; import = Excel only; all = both (admin) */
  view?: 'standards' | 'import' | 'all';
};

export function EfficiencyProjectSetupPanel({
  title,
  subtitle,
  view = 'all',
}: Props) {
  const panelTitle =
    title ??
    (view === 'import'
      ? 'Bulk import from Excel'
      : view === 'standards'
        ? 'Projects & task standards'
        : 'Projects & task standards');
  const panelSubtitle =
    subtitle ??
    (view === 'import'
      ? 'Upload one sheet with multiple projects and task standards. Existing project + task + version rows are updated; new rows are added.'
      : 'Create projects and define standard rates. Employees log output against these tasks after you save them here.');
  const [projects, setProjects] = useState<EfficiencyProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [baselines, setBaselines] = useState<TaskBaseline[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBaselines, setLoadingBaselines] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [renameName, setRenameName] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<BaselineForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<{
    message?: string;
    projectsUpserted?: number;
    baselinesUpserted?: number;
    failedRows?: number;
    errors?: Array<{ rowNumber: number; message: string }>;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: 'project'; projectId: number; projectName: string }
    | { kind: 'baseline'; baseline: TaskBaseline }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ projects: EfficiencyProject[] }>('/api/efficiency-projects');
      const list = data.projects || [];
      setProjects(list);
      setSelectedProjectId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load projects', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBaselines = useCallback(async (projectId: number) => {
    setLoadingBaselines(true);
    try {
      const data = await api<{ baselines: TaskBaseline[] }>(`/api/task-baselines/${projectId}`);
      setBaselines(data.baselines || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load tasks', 'error');
      setBaselines([]);
    } finally {
      setLoadingBaselines(false);
    }
  }, []);

  useEffect(() => {
    loadProjects().catch(() => {});
  }, [loadProjects]);

  useEffect(() => {
    if (selectedProjectId) {
      loadBaselines(selectedProjectId).catch(() => {});
      const p = projects.find((x) => x.id === selectedProjectId);
      setRenameName(p?.name || '');
    } else {
      setBaselines([]);
      setRenameName('');
    }
  }, [selectedProjectId, projects, loadBaselines]);

  async function createProject() {
    const name = newProjectName.trim();
    if (!name) {
      toast('Enter a project name', 'error');
      return;
    }
    try {
      const data = await api<{ project: EfficiencyProject }>('/api/efficiency-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      toast('Project saved', 'success');
      setNewProjectName('');
      await loadProjects();
      setSelectedProjectId(data.project.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save project', 'error');
    }
  }

  async function renameProject() {
    if (!selectedProjectId) return;
    const name = renameName.trim();
    if (!name) {
      toast('Enter a project name', 'error');
      return;
    }
    try {
      await api(`/api/efficiency-projects/${selectedProjectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      toast('Project updated', 'success');
      await loadProjects();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update project', 'error');
    }
  }

  function openCreateBaseline() {
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEditBaseline(b: TaskBaseline) {
    setForm({
      id: b.id,
      taskName: b.task_name,
      versionLabel: b.version_label || '',
      unitLabel: b.unit_label || 'unit',
      calcType: b.calc_type,
      standardHours: b.standard_hours != null ? String(b.standard_hours) : '',
      standardOutputQty: b.standard_output_qty != null ? String(b.standard_output_qty) : '',
      manhoursPerUnit: b.calc_type === 'weight_based' ? String(b.manhours_per_unit) : '',
    });
    setModalOpen(true);
  }

  async function saveBaseline() {
    if (!selectedProjectId) return;
    if (!form.taskName.trim()) {
      toast('Task name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        id: form.id ?? undefined,
        projectId: selectedProjectId,
        taskName: form.taskName.trim(),
        versionLabel: form.versionLabel.trim(),
        unitLabel: form.unitLabel.trim() || 'unit',
        calcType: form.calcType,
      };
      if (form.calcType === 'rate_based') {
        payload.standardHours = Number(form.standardHours);
        payload.standardOutputQty = Number(form.standardOutputQty);
      } else {
        payload.manhoursPerUnit = Number(form.manhoursPerUnit);
      }
      await api('/api/task-baselines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      toast(form.id ? 'Task standard updated' : 'Task standard saved', 'success');
      setModalOpen(false);
      await loadBaselines(selectedProjectId);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save task standard', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteAction() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (confirmDelete.kind === 'project') {
        await api(`/api/efficiency-projects/${confirmDelete.projectId}`, { method: 'DELETE' });
        toast(`Project "${confirmDelete.projectName}" deleted`, 'success');
        setConfirmDelete(null);
        setSelectedProjectId(null);
        await loadProjects();
      } else {
        await api(`/api/task-baselines/${confirmDelete.baseline.id}`, { method: 'DELETE' });
        toast('Task standard deleted', 'success');
        setConfirmDelete(null);
        if (selectedProjectId) await loadBaselines(selectedProjectId);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  }

  function baselineDisplayName(b: TaskBaseline) {
    const version = b.version_label?.trim();
    return version ? `${b.task_name} — ${version}` : b.task_name;
  }

  function downloadImportTemplate() {
    const token = localStorage.getItem('token');
    fetch('/api/efficiency-projects/import-template', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(String(body.message || 'Could not download template'));
        }
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'efficiency-projects-import-template.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e) => toast(e instanceof Error ? e.message : 'Download failed', 'error'));
  }

  async function uploadImportFile() {
    if (!importFile) {
      toast('Choose an Excel file first', 'error');
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/efficiency-projects/import', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(String(data.message || 'Import failed'));
      setImportResult(data as typeof importResult);
      toast(String(data.message || 'Import complete'), 'success');
      setImportFile(null);
      await loadProjects();
      if (selectedProjectId) await loadBaselines(selectedProjectId);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="panel panel--scroll">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{panelTitle}</h2>
          <p className="stat-sub">{panelSubtitle}</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => loadProjects().catch(() => {})}>
          Refresh
        </button>
      </div>

      {(view === 'import' || view === 'all') && (
      <div className="panel" style={{ marginBottom: 16, padding: '12px 14px' }}>
        {view !== 'import' ? (
        <h3 className="panel-title" style={{ fontSize: '1rem', marginBottom: 6 }}>
          Bulk import from Excel
        </h3>
        ) : null}
        {view !== 'import' ? (
        <p className="stat-sub" style={{ marginBottom: 10 }}>
          Upload one sheet with multiple projects and task standards. Existing project + task + version rows are
          updated; new rows are added. The downloaded template includes a Calc Type Guide sheet and
          inline definitions for rate_based and weight_based on the Projects sheet.
        </p>
        ) : null}
        <div className="filters-inline" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={downloadImportTemplate}>
            Download template
          </button>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
            Choose file
            <input
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              style={{ display: 'none' }}
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            />
          </label>
          <span className="stat-sub">{importFile ? importFile.name : 'No file selected'}</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={importing || !importFile}
            onClick={() => uploadImportFile()}
          >
            {importing ? 'Importing…' : 'Upload & import'}
          </button>
        </div>
        {importResult ? (
          <div style={{ marginTop: 10 }}>
            <p className="stat-sub">
              Projects: {importResult.projectsUpserted ?? 0} · Task standards: {importResult.baselinesUpserted ?? 0}
              {(importResult.failedRows ?? 0) > 0 ? ` · Failed rows: ${importResult.failedRows}` : ''}
            </p>
            {(importResult.errors?.length ?? 0) > 0 ? (
              <ul className="stat-sub" style={{ marginTop: 6, paddingLeft: 18 }}>
                {importResult.errors!.slice(0, 8).map((err) => (
                  <li key={`${err.rowNumber}-${err.message}`}>
                    Row {err.rowNumber}: {err.message}
                  </li>
                ))}
                {(importResult.errors?.length ?? 0) > 8 ? (
                  <li>…and {importResult.errors!.length - 8} more</li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      )}

      {(view === 'standards' || view === 'all') && (
      <>
      <div className="filters-inline" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <label>
          New project{' '}
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="e.g. Narayana"
          />
        </label>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => createProject()}>
          Add project
        </button>
      </div>

      {loading ? (
        <p className="stat-sub">Loading projects…</p>
      ) : projects.length === 0 ? (
        <p className="stat-sub">No projects yet. Add one above to get started.</p>
      ) : (
        <>
          <div className="filters-inline" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
            <label>
              Project{' '}
              <select
                value={selectedProjectId ?? ''}
                onChange={(e) => setSelectedProjectId(Number(e.target.value) || null)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Edit project name{' '}
              <input type="text" value={renameName} onChange={(e) => setRenameName(e.target.value)} />
            </label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => renameProject()}>
              Save changes
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                if (selectedProject) {
                  setModalOpen(false);
                  setConfirmDelete({
                    kind: 'project',
                    projectId: selectedProject.id,
                    projectName: selectedProject.name,
                  });
                }
              }}
              disabled={!selectedProject}
            >
              Delete project
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={openCreateBaseline}>
              Add task standard
            </button>
          </div>

          {loadingBaselines ? (
            <p className="stat-sub">Loading task standards…</p>
          ) : baselines.length === 0 ? (
            <p className="stat-sub">
              No task standards for {selectedProject?.name || 'this project'}. Click &quot;Add task standard&quot; to
              define standard hours and output quantity.
            </p>
          ) : (
            <div className="table-wrap table-wrap--scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Version</th>
                    <th>Type</th>
                    <th>Standard</th>
                    <th>Man hours</th>
                    <th>Man hours / unit</th>
                    <th>Actual MH logged</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {baselines.map((b) => (
                    <tr key={b.id}>
                      <td>{b.task_name}</td>
                      <td>{b.version_label || '—'}</td>
                      <td>{b.calc_type === 'weight_based' ? 'Weight' : 'Rate'}</td>
                      <td>
                        {b.calc_type === 'rate_based'
                          ? `${b.standard_hours} hrs / ${b.standard_output_qty} ${b.unit_label}`
                          : `Weight (${b.unit_label})`}
                      </td>
                      <td>
                        {b.calc_type === 'rate_based' && b.standard_hours != null
                          ? Number(b.standard_hours).toFixed(2)
                          : b.calc_type === 'weight_based'
                            ? Number(b.manhours_per_unit).toFixed(4)
                            : '—'}
                      </td>
                      <td>{Number(b.manhours_per_unit).toFixed(4)}</td>
                      <td>
                        {Number(b.total_actual_manhours || 0) > 0
                          ? Number(b.total_actual_manhours).toFixed(2)
                          : '—'}
                        {b.work_log_count ? (
                          <small className="stat-sub" style={{ display: 'block' }}>
                            {b.work_log_count} log{b.work_log_count === 1 ? '' : 's'}
                          </small>
                        ) : null}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEditBaseline(b)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setModalOpen(false);
                              setConfirmDelete({ kind: 'baseline', baseline: b });
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      </>
      )}

      {modalOpen ? (
        <div className="manager-modal-backdrop" role="presentation" onClick={() => setModalOpen(false)}>
          <div
            className="manager-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="baseline-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="manager-modal-head">
              <h3 id="baseline-modal-title">
                {form.id ? 'Edit task standard' : 'Add task standard'}
                {selectedProject ? ` — ${selectedProject.name}` : ''}
              </h3>
              <button type="button" className="manager-modal-close" aria-label="Close" onClick={() => setModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="manager-modal-body">
              <label className="form-group">
                Task
                <input
                  type="text"
                  value={form.taskName}
                  onChange={(e) => setForm((f) => ({ ...f, taskName: e.target.value }))}
                  placeholder="e.g. Production"
                />
              </label>
              <label className="form-group">
                Version
                <input
                  type="text"
                  value={form.versionLabel}
                  onChange={(e) => setForm((f) => ({ ...f, versionLabel: e.target.value }))}
                  placeholder="e.g. V1 Production (optional)"
                />
              </label>
              <label className="form-group">
                Unit label
                <input
                  type="text"
                  value={form.unitLabel}
                  onChange={(e) => setForm((f) => ({ ...f, unitLabel: e.target.value }))}
                  placeholder="e.g. video, page, asset"
                />
              </label>
              <label className="form-group">
                Calculation type
                <select
                  value={form.calcType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      calcType: e.target.value as 'rate_based' | 'weight_based',
                    }))
                  }
                >
                  <option value="rate_based">Rate-based (hours ÷ output qty)</option>
                  <option value="weight_based">Weight-based (fixed MH per unit, e.g. Art difficulty)</option>
                </select>
              </label>
              {form.calcType === 'rate_based' ? (
                <>
                  <label className="form-group">
                    Standard hours (for the batch below)
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={form.standardHours}
                      onChange={(e) => setForm((f) => ({ ...f, standardHours: e.target.value }))}
                      placeholder="e.g. 8"
                    />
                  </label>
                  <label className="form-group">
                    Standard output quantity (in one batch)
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={form.standardOutputQty}
                      onChange={(e) => setForm((f) => ({ ...f, standardOutputQty: e.target.value }))}
                      placeholder="e.g. 10 videos in 8 hours"
                    />
                  </label>
                  <p className="stat-sub">
                    System stores MH/unit = standard hours ÷ standard output qty (e.g. 8 ÷ 10 = 0.8 MH per video).
                  </p>
                </>
              ) : (
                <>
                  <label className="form-group">
                    Manhours per unit (difficulty weight)
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={form.manhoursPerUnit}
                      onChange={(e) => setForm((f) => ({ ...f, manhoursPerUnit: e.target.value }))}
                      placeholder="e.g. Hard=0.5, Medium=0.25, Easy=0.1"
                    />
                  </label>
                  <p className="stat-sub">Used directly as MH/unit — no division (Concept Videos - Art pattern).</p>
                </>
              )}
            </div>
            <div className="manager-modal-foot">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => saveBaseline()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDelete ? (
        <div
          className="manager-modal-backdrop"
          style={{ zIndex: 14000 }}
          role="presentation"
          onClick={() => !deleting && setConfirmDelete(null)}
        >
          <div
            className="manager-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            style={{ zIndex: 14001, marginTop: modalOpen ? 48 : 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="manager-modal-head">
              <h3 id="delete-confirm-title">
                {confirmDelete.kind === 'project' ? 'Delete project?' : 'Delete task standard?'}
              </h3>
              <button
                type="button"
                className="manager-modal-close"
                aria-label="Close"
                disabled={deleting}
                onClick={() => setConfirmDelete(null)}
              >
                ×
              </button>
            </div>
            <div className="manager-modal-body">
              {confirmDelete.kind === 'project' ? (
                <p className="stat-sub">
                  Are you sure you want to delete <strong>{confirmDelete.projectName}</strong>? All task standards
                  under this project will be removed. This cannot be undone if the project has no employee work logs.
                </p>
              ) : (
                <p className="stat-sub">
                  Are you sure you want to delete <strong>{baselineDisplayName(confirmDelete.baseline)}</strong> from{' '}
                  <strong>{selectedProject?.name || 'this project'}</strong>? This cannot be undone if employees have
                  submitted work logs for this task.
                </p>
              )}
            </div>
            <div className="manager-modal-foot">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={deleting}
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={deleting}
                onClick={() => confirmDeleteAction()}
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
