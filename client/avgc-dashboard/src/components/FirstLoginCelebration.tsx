import { useCallback, useEffect, useState } from 'react';
import { api, persistEmployeePatch, readEmployee } from '@/lib/api';
import { runConfettiBurst } from '@/lib/celebration';
import type { PortalNavId } from '@/lib/portalNav';

type Props = {
  userId: number;
  firstName: string;
  onboardingGated?: boolean;
  onClose: () => void;
  onNavigate: (id: PortalNavId) => void;
};

export function FirstLoginCelebration({ userId, firstName, onboardingGated, onClose, onNavigate }: Props) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    runConfettiBurst();
    const hrms = window as Window & { HRMS?: { fireConfettiBurst?: () => void } };
    hrms.HRMS?.fireConfettiBurst?.();
  }, []);

  const dismiss = useCallback(async (nav?: PortalNavId) => {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/api/employees/${userId}/first-login`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFirstLogin: false }),
      });
      const prev = readEmployee();
      if (prev?.id) {
        persistEmployeePatch({ id: prev.id, name: prev.name || '', email: prev.email || '', isFirstLogin: false });
      }
      onClose();
      if (nav) onNavigate(nav);
    } catch {
      onClose();
      if (nav) onNavigate(nav);
    } finally {
      setBusy(false);
    }
  }, [busy, onClose, onNavigate, userId]);

  return (
    <div className="first-login-overlay" role="dialog" aria-modal="true" aria-labelledby="first-login-title">
      <div className="first-login-card">
        <div className="first-login-emoji" aria-hidden="true">
          🎉
        </div>
        <h2 id="first-login-title" className="first-login-title">
          Welcome to AVGC Studios, {firstName}! 🎉
        </h2>
        <p className="first-login-body">
          We&apos;re thrilled to have you on board. Your journey starts with a short onboarding checklist —
          once that&apos;s done, your full portal opens up. Maya, our HR assistant, is here if you have policy
          questions along the way.
        </p>
        <div className="first-login-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              dismiss(onboardingGated ? 'onboarding' : 'dashboard').catch(() => undefined);
            }}
          >
            {onboardingGated ? 'Start onboarding' : 'Go to dashboard'}
          </button>
        </div>
      </div>
    </div>
  );
}
