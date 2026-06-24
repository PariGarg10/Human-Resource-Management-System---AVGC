import { useCallback, useEffect, useState } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

type SummaryRow = {
  id: number;
  name: string;
  email: string;
  employeecode?: string;
  department?: string;
  progressPercent: number;
  onboardingCompleted: boolean;
};

type TaskMeta = {
  items?: Record<string, boolean>;
  score?: number;
} | null;

type OnboardingTask = {
  taskKey: string;
  status: string;
  completedAt?: string | null;
  meta?: TaskMeta;
};

type Detail = {
  employeeName: string;
  progressPercent: number;
  profileCompletionPercentage?: number;
  missingDocuments?: { key: string; label: string }[];
  tasks: OnboardingTask[];
  itSetupItems?: { key: string; label: string }[];
};

type PoshQuestion = {
  id: number;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  sort_order: number;
  is_active: boolean;
};

const TASK_LABELS: Record<string, string> = {
  profile_complete: 'Profile complete',
  policy_read: 'Policy read',
  posh_training: 'POSH training',
  meet_team: 'Meet team',
  it_setup: 'IT setup',
};

function taskLabel(taskKey: string) {
  return TASK_LABELS[taskKey] || taskKey.replace(/_/g, ' ');
}

function TaskResponseDetail({
  task,
  detail,
}: {
  task: OnboardingTask;
  detail: Detail;
}) {
  if (task.taskKey === 'profile_complete') {
    return (
      <div className="onboarding-admin-task-response">
        <p>
          Profile completion: <strong>{detail.profileCompletionPercentage ?? 0}%</strong>
        </p>
        {detail.missingDocuments && detail.missingDocuments.length > 0 ? (
          <p className="stat-sub">
            Missing documents: {detail.missingDocuments.map((d) => d.label).join(', ')}
          </p>
        ) : (
          <p className="stat-sub">All required documents uploaded.</p>
        )}
      </div>
    );
  }

  if (task.taskKey === 'policy_read') {
    return (
      <p className="onboarding-admin-task-response stat-sub">
        {task.status === 'completed'
          ? 'Employee confirmed they have read company policies.'
          : 'Policies not yet acknowledged.'}
      </p>
    );
  }

  if (task.taskKey === 'posh_training') {
    const score = task.meta?.score;
    return (
      <p className="onboarding-admin-task-response stat-sub">
        {score != null ? `Quiz score: ${score}/5` : 'POSH training not completed yet.'}
      </p>
    );
  }

  if (task.taskKey === 'meet_team') {
    return (
      <p className="onboarding-admin-task-response stat-sub">
        {task.status === 'completed'
          ? 'Employee marked meet-the-team as done.'
          : 'Meet-the-team step not completed.'}
      </p>
    );
  }

  if (task.taskKey === 'it_setup') {
    const items = detail.itSetupItems || [];
    const checked = task.meta?.items || {};
    return (
      <ul className="onboarding-admin-task-response onboarding-admin-it-list">
        {items.map((item) => (
          <li key={item.key}>
            <span>{item.label}</span>
            <strong>{checked[item.key] ? 'Yes' : 'No'}</strong>
          </li>
        ))}
      </ul>
    );
  }

  return null;
}

export function AdminOnboardingPanel() {
  const [filter, setFilter] = useState<'all' | 'completed' | 'in_progress' | 'not_started'>('all');
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [questions, setQuestions] = useState<PoshQuestion[]>([]);
  const [qForm, setQForm] = useState({
    question: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    correctOption: 'a',
  });

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ employees: SummaryRow[] }>(
        `/api/onboarding/admin/summary?filter=${filter}`
      );
      setRows(data.employees || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load summary', 'error');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadPosh = useCallback(async () => {
    try {
      const data = await api<{ questions: PoshQuestion[] }>('/api/onboarding/admin/posh/questions');
      setQuestions(data.questions || []);
      const quiz = await api<{ videoUrl?: string }>('/api/posh/quiz');
      setVideoUrl(quiz.videoUrl || '');
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    loadSummary().catch(() => {});
    loadPosh().catch(() => {});
  }, [loadSummary, loadPosh]);

  async function openDetail(id: number) {
    try {
      const data = await api<Detail>(`/api/onboarding/admin/${id}/detail`);
      setDetail(data);
      setSelectedTaskKey(data.tasks[0]?.taskKey || null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load detail', 'error');
    }
  }

  async function saveVideo() {
    try {
      await api('/api/onboarding/admin/posh/video', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl }),
      });
      toast('POSH video URL saved', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error');
    }
  }

  async function addQuestion() {
    try {
      await api('/api/onboarding/admin/posh/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(qForm),
      });
      setQForm({
        question: '',
        optionA: '',
        optionB: '',
        optionC: '',
        optionD: '',
        correctOption: 'a',
      });
      await loadPosh();
      toast('Question added', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Add failed', 'error');
    }
  }

  async function deleteQuestion(id: number) {
    if (!window.confirm('Delete this question?')) return;
    try {
      await api(`/api/onboarding/admin/posh/questions/${id}`, { method: 'DELETE' });
      await loadPosh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'error');
    }
  }

  async function exportCsv() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/onboarding/admin/export.csv', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'onboarding-report.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export failed', 'error');
    }
  }

  const selectedTask = detail?.tasks.find((t) => t.taskKey === selectedTaskKey) || null;

  return (
    <div className="admin-onboarding">
      <div className="panel">
        <div className="panel-header" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <h2 className="panel-title" style={{ margin: 0, flex: 1 }}>
            Onboarding (last 30 days)
          </h2>
          <button type="button" className="btn btn-outline btn-sm" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
        <div className="exit-admin-tabs">
          {(['all', 'in_progress', 'not_started', 'completed'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFilter(f)}
            >
              {f.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        {loading ? (
          <p className="stat-sub">Loading…</p>
        ) : (
          <div className="table-wrap table-wrap--scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="stat-sub">
                      No employees in this filter.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.name}
                        <span className="stat-sub"> · {r.employeecode}</span>
                      </td>
                      <td>{r.department || '—'}</td>
                      <td>{r.progressPercent}%</td>
                      <td>
                        <StatusBadge status={r.onboardingCompleted ? 'completed' : 'pending'} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => openDetail(r.id)}
                        >
                          View tasks ({r.progressPercent}%)
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail ? (
        <div className="panel">
          <h3 className="panel-title">{detail.employeeName} — onboarding tasks</h3>
          <div className="onboarding-admin-progress-bar-wrap">
            <div className="onboarding-admin-progress-bar" style={{ width: `${detail.progressPercent}%` }} />
          </div>
          <p className="stat-sub">{detail.progressPercent}% complete — click a task to view responses</p>
          <ul className="onboarding-admin-detail">
            {detail.tasks.map((t) => (
              <li key={t.taskKey}>
                <button
                  type="button"
                  className={`onboarding-admin-task-btn${selectedTaskKey === t.taskKey ? ' is-active' : ''}`}
                  onClick={() => setSelectedTaskKey(t.taskKey)}
                >
                  <span>{taskLabel(t.taskKey)}</span>
                  <StatusBadge status={t.status} />
                </button>
              </li>
            ))}
          </ul>
          {selectedTask ? <TaskResponseDetail task={selectedTask} detail={detail} /> : null}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              setDetail(null);
              setSelectedTaskKey(null);
            }}
          >
            Close
          </button>
        </div>
      ) : null}

      <div className="panel">
        <h3 className="panel-title">POSH training video</h3>
        <div className="form-row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="form-group" style={{ flex: 1, minWidth: 240 }}>
            <span>YouTube or video URL</span>
            <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://..." />
          </label>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => saveVideo()}>
            Save URL
          </button>
        </div>
      </div>

      <div className="panel">
        <h3 className="panel-title">POSH quiz questions</h3>
        <div className="onboarding-admin-q-form">
          <input
            placeholder="Question"
            value={qForm.question}
            onChange={(e) => setQForm({ ...qForm, question: e.target.value })}
          />
          <input placeholder="Option A" value={qForm.optionA} onChange={(e) => setQForm({ ...qForm, optionA: e.target.value })} />
          <input placeholder="Option B" value={qForm.optionB} onChange={(e) => setQForm({ ...qForm, optionB: e.target.value })} />
          <input placeholder="Option C" value={qForm.optionC} onChange={(e) => setQForm({ ...qForm, optionC: e.target.value })} />
          <input placeholder="Option D" value={qForm.optionD} onChange={(e) => setQForm({ ...qForm, optionD: e.target.value })} />
          <select
            value={qForm.correctOption}
            onChange={(e) => setQForm({ ...qForm, correctOption: e.target.value })}
          >
            <option value="a">A correct</option>
            <option value="b">B correct</option>
            <option value="c">C correct</option>
            <option value="d">D correct</option>
          </select>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => addQuestion()}>
            Add question
          </button>
        </div>
        <ul className="onboarding-admin-q-list">
          {questions.map((q) => (
            <li key={q.id}>
              <strong>{q.question}</strong>
              <span className="stat-sub"> · correct: {q.correct_option.toUpperCase()}</span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => deleteQuestion(q.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
