import { PerformancePortal } from '@/features/performance/PerformancePortal';
import type { PortalRole } from '@/lib/portalNav';

type PerfTab = 'kras' | 'self-assessment' | 'manager-review' | 'overall' | 'team';

export function PerformancePanel({
  portalRole,
  initialTab,
}: {
  portalRole: PortalRole;
  initialTab?: PerfTab;
}) {
  return <PerformancePortal portalRole={portalRole} initialTab={initialTab} />;
}
