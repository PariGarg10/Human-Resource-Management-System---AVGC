import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import type { PortalNavId } from '@/lib/portalNav';
import { toast } from '@/lib/toast';
import type { EmployeeUser } from '@/types/employee';

type Task = {
  taskKey: string;
  status: string;
  meta?: { items?: Record<string, boolean>; score?: number } | null;
};

type OnboardingTaskKey = 'profile_complete' | 'policy_read' | 'posh_training' | 'meet_team';

type OnboardingData = {
  employeeName: string;
  department?: string | null;
  onboardingCompleted: boolean;
  profileCompletionPercentage: number;
  missingProfileFields?: { key: string; label: string }[];
  missingDocuments?: { key: string; label: string }[];
  onboardingBlockers?: { taskKey: string; title: string; details: string[] }[];
  progressPercent: number;
  tasks: Task[];
  departmentPeers: { id: number; name: string; designation?: string }[];
  poshVideoUrl?: string | null;
};

type PolicyRow = {
  id: number;
  title: string;
  type: string;
  fileUrl?: string | null;
  externalUrl?: string | null;
};

type PoshQuestion = {
  id: number;
  question: string;
  options: { a: string; b: string; c: string; d: string };
};

type Props = {
  user: EmployeeUser | null;
  onNavigate: (id: PortalNavId) => void;
  onOnboardingCompleted?: (options?: { celebrate?: boolean }) => void;
};

const ONBOARDING_TASKS: { key: OnboardingTaskKey; title: string; important?: boolean }[] = [
  { key: 'profile_complete', title: 'Complete your profile' },
  { key: 'policy_read', title: 'Read company policies' },
  { key: 'posh_training', title: 'POSH training', important: true },
  { key: 'meet_team', title: 'Meet your team' },
];

function taskStatus(tasks: Task[], key: string) {
  return tasks.find((t) => t.taskKey === key)?.status || 'pending';
}

function ProfileIncompleteList({
  missingProfileFields,
  missingDocuments,
  profileCompletionPercentage,
}: {
  missingProfileFields: { key: string; label: string }[];
  missingDocuments: { key: string; label: string }[];
  profileCompletionPercentage: number;
}) {
  const hasGaps = missingProfileFields.length > 0 || missingDocuments.length > 0;
  if (!hasGaps) {
    return <p className="stat-sub onboarding-profile-complete-note">All profile requirements are complete.</p>;
  }

  return (
    <div className="onboarding-profile-gaps">
      <p className="onboarding-profile-gaps-title">
        Profile {profileCompletionPercentage}% complete — still needed:
      </p>
      <ul className="onboarding-checklist">
        {missingProfileFields.map((field) => (
          <li key={field.key} className="onboarding-checklist-item onboarding-checklist-item--pending">
            {field.label}
          </li>
        ))}
        {missingDocuments.map((doc) => (
          <li key={doc.key} className="onboarding-checklist-item onboarding-checklist-item--pending">
            {doc.label} <span className="onboarding-checklist-hint">(upload in Profile → documents)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PolicyModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api<{ policies: PolicyRow[] }>('/api/policies')
      .then((d) => setPolicies(d.policies || []))
      .catch(() => setPolicies([]))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div className="onboarding-modal-overlay" role="dialog" aria-modal="true">
      <div className="onboarding-modal">
        <h3 className="panel-title">Company policies</h3>
        <p className="stat-sub">Review the documents below, then confirm you have read them.</p>
        {loading ? (
          <p className="stat-sub">Loading policies…</p>
        ) : policies.length === 0 ? (
          <p className="stat-sub">No policy documents uploaded yet. You may still confirm below.</p>
        ) : (
          <ul className="onboarding-policy-list">
            {policies.map((p) => {
              const url = p.type === 'link' ? p.externalUrl : p.fileUrl;
              return (
                <li key={p.id}>
                  <strong>{p.title}</strong>
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                      Open
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <label className="exit-checkbox">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          I have read and understood all policies
        </label>
        <div className="onboarding-modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!agreed}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            Mark complete
          </button>
        </div>
      </div>
    </div>
  );
}

function PoshTraining({
  employeeId,
  embedUrl,
  completed,
  onComplete,
}: {
  employeeId: number;
  embedUrl?: string | null;
  completed: boolean;
  onComplete: () => void;
}) {
  const [questions, setQuestions] = useState<PoshQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<{ passed: boolean; score: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCert, setShowCert] = useState(false);

  useEffect(() => {
    api<{ questions: PoshQuestion[]; embedUrl?: string }>('/api/posh/quiz')
      .then((d) => {
        setQuestions(d.questions || []);
        setAnswers((d.questions || []).map(() => ''));
      })
      .catch(() => setQuestions([]));
  }, []);

  async function submitQuiz() {
    setBusy(true);
    try {
      const data = await api<{ passed: boolean; score: number }>('/api/posh/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, answers }),
      });
      setResult(data);
      if (data.passed) {
        setShowCert(true);
        onComplete();
        toast('POSH training completed!', 'success');
      } else {
        toast('Please retake the quiz — you need 4/5 correct.', 'error');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Quiz submit failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  function printCertificate() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html><head><title>POSH Training Certificate</title>
      <style>body{font-family:Arial,sans-serif;text-align:center;padding:48px}
      h1{color:#ed1d24} .brand{color:#697279}</style></head><body>
      <h1>Certificate of Completion</h1>
      <p class="brand">AVGC Studios — POSH Training</p>
      <p>This certifies successful completion of mandatory POSH awareness training.</p>
      <p>Score: ${result?.score ?? 5}/5</p>
      <p>Date: ${new Date().toLocaleDateString()}</p>
      </body></html>`);
    w.document.close();
    w.print();
  }

  if (completed) {
    return (
      <p className="stat-sub">
        <StatusBadge status="completed" /> POSH training completed
      </p>
    );
  }

  return (
    <div className="onboarding-posh">
      {embedUrl ? (
        <div className="onboarding-video-wrap">
          <iframe
            title="POSH training video"
            src={embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <p className="stat-sub">Training video will appear here once HR configures it.</p>
      )}
      {questions.length > 0 ? (
        <div className="onboarding-quiz">
          <h4>Quiz (pass mark: 4/5)</h4>
          {questions.map((q, idx) => (
            <fieldset key={q.id} className="onboarding-quiz-q">
              <legend>{idx + 1}. {q.question}</legend>
              {(['a', 'b', 'c', 'd'] as const).map((key) => (
                <label key={key} className="onboarding-quiz-opt">
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={answers[idx] === key}
                    onChange={() => {
                      const next = [...answers];
                      next[idx] = key;
                      setAnswers(next);
                    }}
                  />
                  {q.options[key]}
                </label>
              ))}
            </fieldset>
          ))}
          {result && !result.passed ? (
            <p className="onboarding-quiz-fail">Score: {result.score}/5 — Please retake the quiz.</p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || answers.some((a) => !a)}
            onClick={() => submitQuiz()}
          >
            {busy ? 'Submitting…' : 'Submit quiz'}
          </button>
        </div>
      ) : null}
      {showCert ? (
        <button type="button" className="btn btn-outline btn-sm" onClick={printCertificate}>
          Download certificate
        </button>
      ) : null}
    </div>
  );
}

export function OnboardingPanel({ user, onNavigate, onOnboardingCompleted }: Props) {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [openTask, setOpenTask] = useState<OnboardingTaskKey | null>(null);

  const employeeId = user?.id;

  const load = useCallback(async () => {
    if (!employeeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api<OnboardingData>(`/api/onboarding/${employeeId}`);
      setData(res);
      if (res.onboardingCompleted) onOnboardingCompleted?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load onboarding', 'error');
    } finally {
      setLoading(false);
    }
  }, [employeeId, onOnboardingCompleted]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    const refresh = () => {
      load().catch(() => undefined);
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('hrms:employee-updated', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('hrms:employee-updated', refresh);
    };
  }, [load]);

  const completeTask = useCallback(
    async (taskKey: string) => {
      if (!employeeId) return;
      try {
        const res = await api<OnboardingData>(`/api/onboarding/${employeeId}/task`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskKey, status: 'completed' }),
        });
        setData(res);
        if (res.onboardingCompleted) {
          await api(`/api/employees/${employeeId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ onboardingCompleted: true }),
          });
          onOnboardingCompleted?.({ celebrate: true });
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not update task', 'error');
      }
    },
    [employeeId, onOnboardingCompleted]
  );

  const tasks = data?.tasks || [];

  const poshEmbed = useMemo(() => {
    const url = data?.poshVideoUrl || '';
    const watch = url.match(/[?&]v=([^&]+)/);
    if (watch) return `https://www.youtube.com/embed/${watch[1]}`;
    const short = url.match(/youtu\.be\/([^?]+)/);
    if (short) return `https://www.youtube.com/embed/${short[1]}`;
    if (url.includes('youtube.com/embed/')) return url;
    return url || null;
  }, [data?.poshVideoUrl]);

  const tasksLeft = ONBOARDING_TASKS.filter(
    (task) => taskStatus(tasks, task.key) !== 'completed'
  ).length;

  function toggleTask(key: OnboardingTaskKey) {
    setOpenTask((current) => (current === key ? null : key));
  }

  function renderTaskBody(key: OnboardingTaskKey) {
    if (!data) return null;

    switch (key) {
      case 'profile_complete':
        return (
          <>
            <p className="stat-sub">
              Fill in your personal details, emergency contact, and bank information. Upload{' '}
              <strong>Aadhar card</strong>, <strong>PAN card</strong>, and{' '}
              <strong>Cancelled cheque/ Passbook</strong> under Profile → documents (all required).
            </p>
            <ProfileIncompleteList
              missingProfileFields={data.missingProfileFields || []}
              missingDocuments={data.missingDocuments || []}
              profileCompletionPercentage={data.profileCompletionPercentage}
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onNavigate('profile')}>
              Go to Profile
            </button>
          </>
        );
      case 'policy_read':
        return (
          <>
            <p className="stat-sub">
              Review AVGC Studios HR policies, code of conduct, and leave policies. Questions? Chat with{' '}
              <strong>Maya</strong> (the policy assistant in the bottom-right corner).
            </p>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={taskStatus(tasks, 'policy_read') === 'completed'}
              onClick={() => setPolicyOpen(true)}
            >
              Open policy documents
            </button>
          </>
        );
      case 'posh_training':
        return (
          <>
            <p className="stat-sub">
              Mandatory training as per POSH Act 2013. All employees must complete this.
            </p>
            {employeeId ? (
              <PoshTraining
                employeeId={employeeId}
                embedUrl={poshEmbed}
                completed={taskStatus(tasks, 'posh_training') === 'completed'}
                onComplete={() => load()}
              />
            ) : null}
          </>
        );
      case 'meet_team':
        return (
          <>
            <p className="stat-sub">
              {data.department
                ? `Colleagues in ${data.department}:`
                : 'See who you will be working with.'}
            </p>
            {data.departmentPeers.length > 0 ? (
              <ul className="onboarding-peers">
                {data.departmentPeers.map((p) => (
                  <li key={p.id}>
                    <strong>{p.name}</strong>
                    {p.designation ? <span className="stat-sub"> · {p.designation}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="stat-sub">Team list will appear when colleagues are in your department.</p>
            )}
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                completeTask('meet_team').catch(() => undefined);
                onNavigate('teams');
              }}
            >
              View org chart
            </button>
          </>
        );
      default:
        return null;
    }
  }

  if (loading || !data) {
    return (
      <div className="panel">
        <p className="stat-sub">Loading onboarding…</p>
      </div>
    );
  }

  if (data.onboardingCompleted) {
    return (
      <div className="panel onboarding-done-panel">
        <h2 className="panel-title">Onboarding complete</h2>
        <p className="stat-sub">Opening your full portal…</p>
      </div>
    );
  }

  const firstName = data.employeeName?.split(/\s+/)[0] || 'there';
  const blockers = data.onboardingBlockers || [];

  return (
    <div className="onboarding-page">
      <div className="onboarding-banner panel">
        <p className="onboarding-banner-eyebrow">Your first steps at AVGC</p>
        <h2 className="panel-title">Welcome, {firstName}!</h2>
        <p className="stat-sub onboarding-banner-lead">
          Work through the checklist below — once everything is done, we&apos;ll unlock your full employee
          portal. Take your time; we&apos;re glad you&apos;re here.
        </p>
        {blockers.length > 0 ? (
          <div className="onboarding-blockers" role="status">
            <p className="onboarding-blockers-title">Still blocking onboarding:</p>
            <ul className="onboarding-blockers-list">
              {blockers.map((blocker) => (
                <li key={blocker.taskKey}>
                  <strong>{blocker.title}</strong>
                  {blocker.details.length > 0 ? (
                    <ul className="onboarding-blockers-details">
                      {blocker.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="stat-sub"> — not completed yet</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="onboarding-progress-wrap">
          <div className="onboarding-progress-label">
            <span>
              <strong>{data.progressPercent}%</strong> complete
              {tasksLeft > 0 ? (
                <span className="stat-sub"> · {tasksLeft} task{tasksLeft === 1 ? '' : 's'} left</span>
              ) : (
                <span className="stat-sub"> · finishing up…</span>
              )}
            </span>
            {data.profileCompletionPercentage < 100 &&
            taskStatus(tasks, 'profile_complete') !== 'completed' ? (
              <span className="stat-sub">Profile: {data.profileCompletionPercentage}%</span>
            ) : null}
          </div>
          <div
            className="onboarding-progress-track"
            role="progressbar"
            aria-valuenow={data.progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="onboarding-progress-fill" style={{ width: `${data.progressPercent}%` }} />
          </div>
        </div>
      </div>

      <div className="panel onboarding-task-list-panel">
        <ul className="onboarding-task-list">
          {ONBOARDING_TASKS.map((task) => {
            const completed = taskStatus(tasks, task.key) === 'completed';
            const isOpen = openTask === task.key;

            return (
              <li key={task.key} className={`onboarding-task-row${isOpen ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="onboarding-task-row-btn"
                  aria-expanded={isOpen}
                  onClick={() => toggleTask(task.key)}
                >
                  <span className="onboarding-task-row-title">
                    {task.title}
                    {task.important ? (
                      <span className="onboarding-important-badge">Important</span>
                    ) : null}
                  </span>
                  <span className="onboarding-task-row-meta">
                    <span
                      className={`onboarding-task-status${
                        completed ? ' onboarding-task-status--completed' : ' onboarding-task-status--pending'
                      }`}
                    >
                      {completed ? 'Completed' : 'Pending'}
                    </span>
                    <ChevronDown size={18} className="onboarding-task-row-chevron" aria-hidden />
                  </span>
                </button>
                {isOpen ? <div className="onboarding-task-body">{renderTaskBody(task.key)}</div> : null}
              </li>
            );
          })}
        </ul>
      </div>

      <PolicyModal
        open={policyOpen}
        onClose={() => setPolicyOpen(false)}
        onConfirm={() => completeTask('policy_read')}
      />
    </div>
  );
}
