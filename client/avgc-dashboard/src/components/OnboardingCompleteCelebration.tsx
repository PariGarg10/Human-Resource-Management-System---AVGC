import { useEffect, useState } from 'react';
import { runConfettiBurst } from '@/lib/celebration';

type Props = {
  firstName: string;
  onEnterPortal: () => void;
};

const UNLOCK_STEPS = [
  'Profile verified',
  'Policies acknowledged',
  'POSH training complete',
  'Team introductions',
  'IT setup done',
];

export function OnboardingCompleteCelebration({ firstName, onEnterPortal }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    runConfettiBurst();
    const hrms = window as Window & { HRMS?: { fireConfettiBurst?: () => void } };
    hrms.HRMS?.fireConfettiBurst?.();
  }, []);

  useEffect(() => {
    if (step >= UNLOCK_STEPS.length) return;
    const t = window.setTimeout(() => setStep((s) => s + 1), 380);
    return () => window.clearTimeout(t);
  }, [step]);

  return (
    <div className="onboarding-complete-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-complete-title">
      <div className="onboarding-complete-card">
        <div className="onboarding-complete-badge" aria-hidden="true">
          ✓
        </div>
        <h2 id="onboarding-complete-title" className="onboarding-complete-title">
          You&apos;re all set, {firstName}!
        </h2>
        <p className="onboarding-complete-body">
          You&apos;ve finished every onboarding step. Your full employee portal is ready — dashboard, leave,
          attendance, and everything else is now unlocked.
        </p>
        <ul className="onboarding-complete-checklist" aria-label="Completed steps">
          {UNLOCK_STEPS.map((label, idx) => (
            <li
              key={label}
              className={idx < step ? 'onboarding-complete-checklist__item--done' : ''}
            >
              <span className="onboarding-complete-check" aria-hidden="true">
                {idx < step ? '✓' : '·'}
              </span>
              {label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-primary onboarding-complete-cta"
          disabled={step < UNLOCK_STEPS.length}
          onClick={onEnterPortal}
        >
          {step < UNLOCK_STEPS.length ? 'Unlocking your portal…' : 'Enter your portal →'}
        </button>
      </div>
    </div>
  );
}
