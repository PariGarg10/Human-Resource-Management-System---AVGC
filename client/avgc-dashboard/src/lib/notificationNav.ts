import type { PortalNavId } from '@/lib/portalNav';

export function resolveNotificationNav(
  type: string,
  message?: string,
  role?: string
): PortalNavId {
  const t = String(type || '').toLowerCase();
  const msg = String(message || '').toLowerCase();
  const r = String(role || '').toLowerCase();

  if (t === 'broadcast') {
    if (msg.includes('asset')) return 'asset-management';
    if (msg.includes('holiday')) return 'holiday-calendar';
    if (msg.includes('policy') || msg.includes('policies')) return 'policies-and-links';
    if (msg.includes('leave')) return 'leave-history';
    if (msg.includes('social') || msg.includes('gaming')) return 'social-portal';
    return 'dashboard';
  }

  if (t === 'leave_applied') {
    if (r === 'manager' || r === 'admin' || r === 'founder' || r === 'it_head') {
      return 'leave-approval';
    }
    return 'leave-history';
  }

  if (t.startsWith('leave_')) return 'leave-history';

  if (t.includes('concern')) return 'helpdesk';

  if (t === 'birthday') return 'teams';

  if (t.includes('live_activity') || t === 'live_activity' || t === 'live_activity_winner') {
    return 'live-activities';
  }

  if (msg.includes('asset')) return 'asset-management';
  if (msg.includes('attendance')) return 'attendance';

  if (t.startsWith('exit_') || t === 'exit_initiated' || t === 'exit_completed') {
    if (msg.includes('your exit')) return 'exit';
    if (r === 'manager') return 'exit-clearances';
    if (r === 'admin' || r === 'founder' || r === 'it_head') return 'exit-clearances';
    return 'exit';
  }

  if (t.startsWith('performance_')) {
    if (r === 'manager') return 'performance-team';
    return 'performance';
  }

  return 'dashboard';
}
