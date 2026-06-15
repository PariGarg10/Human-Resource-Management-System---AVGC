import { useCallback, useEffect, useMemo, useState } from 'react';
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

type OnboardingData = {
  employeeName: string;
  department?: string | null;
  onboardingCompleted: boolean;
  profileCompletionPercentage: number;
  progressPercent: number;
  tasks: Task[];
  itSetupItems: { key: string; label: string }[];
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

function taskStatus(tasks: Task[], key: string) {
  return tasks.find((t) => t.taskKey === key)?.status || 'pending';
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
    return <p className="stat-sub"><StatusBadge status="approved" /> POSH training completed</p>;
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
  const [itItems, setItItems] = useState<Record<string, boolean>>({});

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
      const itTask = res.tasks.find((t) => t.taskKey === 'it_setup');
      setItItems(itTask?.meta?.items || {});
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

  const completeTask = useCallback(
    async (taskKey: string, meta?: { items?: Record<string, boolean> }) => {
      if (!employeeId) return;
      try {
        const res = await api<OnboardingData>(`/api/onboarding/${employeeId}/task`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskKey, status: 'completed', meta }),
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
  const profileDone = taskStatus(tasks, 'profile_complete') === 'completed';
  const policyDone = taskStatus(tasks, 'policy_read') === 'completed';
  const poshDone = taskStatus(tasks, 'posh_training') === 'completed';
  const teamDone = taskStatus(tasks, 'meet_team') === 'completed';
  const itDone = taskStatus(tasks, 'it_setup') === 'completed';

  const poshEmbed = useMemo(() => {
    const url = data?.poshVideoUrl || '';
    const watch = url.match(/[?&]v=([^&]+)/);
    if (watch) return `https://www.youtube.com/embed/${watch[1]}`;
    const short = url.match(/youtu\.be\/([^?]+)/);
    if (short) return `https://www.youtube.com/embed/${short[1]}`;
    if (url.includes('youtube.com/embed/')) return url;
    return url || null;
  }, [data?.poshVideoUrl]);

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
        <p className="stat-sub">You&apos;ve finished all onboarding tasks. Your portal is unlocking…</p>
      </div>
    );
  }

  const firstName = data.employeeName?.split(/\s+/)[0] || 'there';
  const tasksLeft = 5 - Math.round((data.progressPercent / 100) * 5);

  return (
    <div className="onboarding-page">
      <div className="onboarding-banner panel">
        <p className="onboarding-banner-eyebrow">Your first steps at AVGC</p>
        <h2 className="panel-title">Welcome, {firstName}!</h2>
        <p className="stat-sub onboarding-banner-lead">
          Work through the checklist below — once everything is done, we&apos;ll unlock your full employee
          portal. Take your time; we&apos;re glad you&apos;re here.
        </p>
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
            {data.profileCompletionPercentage < 100 ? (
              <span className="stat-sub">Profile: {data.profileCompletionPercentage}%</span>
            ) : null}
          </div>
          <div className="onboarding-progress-track" role="progressbar" aria-valuenow={data.progressPercent} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="onboarding-progress-fill"
              style={{ width: `${data.progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="onboarding-task-grid">
        <article className="onboarding-task-card panel">
          <div className="onboarding-task-head">
            <h3>Complete your profile</h3>
            <StatusBadge status={profileDone ? 'approved' : 'pending'} />
          </div>
          <p className="stat-sub">
            Fill in your personal details, emergency contact, and bank information.
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onNavigate('profile')}>
            Go to Profile
          </button>
        </article>

        <article className="onboarding-task-card panel">
          <div className="onboarding-task-head">
            <h3>Read company policies</h3>
            <StatusBadge status={policyDone ? 'approved' : 'pending'} />
          </div>
          <p className="stat-sub">
            Review AVGC Studios HR policies, code of conduct, and leave policies. Questions? Chat with{' '}
            <strong>Maya</strong> (the policy assistant in the bottom-right corner).
          </p>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={policyDone}
            onClick={() => setPolicyOpen(true)}
          >
            Open policy documents
          </button>
        </article>

        <article className="onboarding-task-card panel onboarding-task-card--posh">
          <div className="onboarding-task-head">
            <h3>
              POSH training <span className="onboarding-important-badge">Important</span>
            </h3>
            <StatusBadge status={poshDone ? 'approved' : 'pending'} />
          </div>
          <p className="stat-sub">
            Mandatory training as per POSH Act 2013. All employees must complete this.
          </p>
          {employeeId ? (
            <PoshTraining
              employeeId={employeeId}
              embedUrl={poshEmbed}
              completed={poshDone}
              onComplete={() => load()}
            />
          ) : null}
        </article>

        <article className="onboarding-task-card panel">
          <div className="onboarding-task-head">
            <h3>Meet your team</h3>
            <StatusBadge status={teamDone ? 'approved' : 'pending'} />
          </div>
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
        </article>

        <article className="onboarding-task-card panel">
          <div className="onboarding-task-head">
            <h3>IT setup checklist</h3>
            <StatusBadge status={itDone ? 'approved' : 'pending'} />
          </div>
          <ul className="onboarding-it-list">
            {(data.itSetupItems || []).map((item) => (
              <li key={item.key}>
                <label className="exit-checkbox onboarding-it-checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(itItems[item.key])}
                    disabled={itDone}
                    onChange={(e) => {
                      const next = { ...itItems, [item.key]: e.target.checked };
                      setItItems(next);
                      completeTask('it_setup', { items: next }).catch(() => undefined);
                    }}
                  />
                  {item.label}
                </label>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <PolicyModal
        open={policyOpen}
        onClose={() => setPolicyOpen(false)}
        onConfirm={() => completeTask('policy_read')}
      />
    </div>
  );
}
