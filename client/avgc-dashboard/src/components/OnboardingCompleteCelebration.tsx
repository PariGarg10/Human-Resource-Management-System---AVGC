import { useEffect, useRef } from 'react';
import { runConfettiBurstLight } from '@/lib/celebration';

type Props = {
  firstName: string;
  onEnterPortal: () => void;
};

export function OnboardingCompleteCelebration({ firstName, onEnterPortal }: Props) {
  const enteredRef = useRef(false);

  useEffect(() => {
    runConfettiBurstLight();
    const timer = window.setTimeout(() => {
      if (enteredRef.current) return;
      enteredRef.current = true;
      onEnterPortal();
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [onEnterPortal]);

  function enterNow() {
    if (enteredRef.current) return;
    enteredRef.current = true;
    onEnterPortal();
  }

  return (
    <div
      className="onboarding-complete-overlay onboarding-complete-overlay--light"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-complete-title"
    >
      <div className="onboarding-complete-card onboarding-complete-card--compact">
        <div className="onboarding-complete-badge" aria-hidden="true">
          ✓
        </div>
        <h2 id="onboarding-complete-title" className="onboarding-complete-title">
          You&apos;re all set, {firstName}!
        </h2>
        <p className="onboarding-complete-body">
          Your full employee portal is unlocking — dashboard, leave, attendance, and more.
        </p>
        <button type="button" className="btn btn-primary onboarding-complete-cta" onClick={enterNow}>
          Continue →
        </button>
      </div>
    </div>
  );
}
