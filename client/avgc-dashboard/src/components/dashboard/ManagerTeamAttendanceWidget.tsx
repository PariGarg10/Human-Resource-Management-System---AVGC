import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatDisplayDate } from '@/lib/formatDate';
import type { PortalNavId } from '@/lib/portalNav';

type DailyRecord = {
  employeeid: number;
  name: string;
  employeecode?: string;
  punchin?: string | null;
  status: string;
};

type TeamLeave = {
  id: number;
  name: string;
  employeecode?: string;
  leavetype: string;
  fromdate: string;
  todate: string;
  status: string;
};

type ModalKind = 'present' | 'on-leave' | null;

type Props = {
  onNavigate: (id: PortalNavId) => void;
  variant?: 'full' | 'footer';
  summaryCounts?: { present: number; onLeave: number } | null;
};

function formatTime(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function daysBetween(start: string, end: string) {
  const a = new Date(start.slice(0, 10));
  const b = new Date(end.slice(0, 10));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}

function SkeletonTile() {
  return (
    <div className="manager-team-tile manager-team-tile--skeleton">
      <div className="manager-skeleton-line" style={{ width: '60%' }} />
      <div className="manager-skeleton-line manager-skeleton-line--lg" style={{ width: '40%' }} />
    </div>
  );
}

export function ManagerTeamAttendanceWidget({
  onNavigate,
  variant = 'full',
  summaryCounts = null,
}: Props) {
  const [loading, setLoading] = useState(!summaryCounts || variant !== 'footer');
  const [detailLoaded, setDetailLoaded] = useState(false);
  const [present, setPresent] = useState<DailyRecord[]>([]);
  const [onLeave, setOnLeave] = useState<TeamLeave[]>([]);
  const [upcoming, setUpcoming] = useState<TeamLeave[]>([]);
  const [modal, setModal] = useState<ModalKind>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const date = today;
      const [daily, teamLeaves] = await Promise.all([
        api<{ records: DailyRecord[] }>(`/api/manager/attendance/daily?date=${date}`),
        api<{ leaves: TeamLeave[] }>('/api/leaves/team'),
      ]);

      const records = daily.records || [];
      setPresent(records.filter((r) => r.status === 'present' || r.status === 'halfday'));

      const approved = (teamLeaves.leaves || []).filter((l) => l.status === 'approved');
      const onLeaveToday = approved.filter(
        (l) => l.fromdate.slice(0, 10) <= date && l.todate.slice(0, 10) >= date
      );
      setOnLeave(onLeaveToday);

      const in7 = new Date();
      in7.setDate(in7.getDate() + 7);
      const end = in7.toISOString().slice(0, 10);
      const upcomingLeaves = approved
        .filter((l) => {
          const start = l.fromdate.slice(0, 10);
          return start > date && start <= end;
        })
        .sort((a, b) => a.fromdate.localeCompare(b.fromdate))
        .slice(0, 5);
      setUpcoming(upcomingLeaves);
      setDetailLoaded(true);
    } catch {
      setPresent([]);
      setOnLeave([]);
      setUpcoming([]);
    } finally {
      setLoading(false);
    }
  }, [today]);

  const ensureDetailLoaded = useCallback(() => {
    if (detailLoaded) return;
    load().catch(() => {});
  }, [detailLoaded, load]);

  useEffect(() => {
    if (variant === 'footer' && summaryCounts) return;
    load().catch(() => {});
  }, [load, summaryCounts, variant]);

  const isFooter = variant === 'footer';
  const presentCount =
    summaryCounts && isFooter && !detailLoaded ? summaryCounts.present : present.length;
  const onLeaveCount =
    summaryCounts && isFooter && !detailLoaded ? summaryCounts.onLeave : onLeave.length;

  const openModal = (kind: ModalKind) => {
    ensureDetailLoaded();
    setModal(kind);
  };

  return (
    <>
      <section
        className={`manager-team-attendance dashboard-home-card${isFooter ? ' manager-team-attendance--footer' : ''}`}
        aria-label="Team attendance today"
      >
        {isFooter ? (
          <div className="manager-team-footer-grid">
            <div className="manager-team-footer-head">
              <p className="manager-team-footer-title">Team attendance today</p>
              <p className="manager-team-footer-date">{formatDisplayDate(today)}</p>
              <button
                type="button"
                className="btn btn-outline btn-sm manager-team-footer-cta"
                onClick={() => onNavigate('team-attendance')}
              >
                View team
              </button>
            </div>

            <div className="manager-team-tiles manager-team-tiles--inline">
              {loading ? (
                <>
                  <SkeletonTile />
                  <SkeletonTile />
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="manager-team-tile manager-team-tile--present manager-team-tile--inline"
                    onClick={() => openModal('present')}
                  >
                    <span className="manager-team-tile-label">Present</span>
                    <strong className="manager-team-tile-count">{presentCount}</strong>
                  </button>
                  <button
                    type="button"
                    className="manager-team-tile manager-team-tile--leave manager-team-tile--inline"
                    onClick={() => openModal('on-leave')}
                  >
                    <span className="manager-team-tile-label">On leave</span>
                    <strong className="manager-team-tile-count">{onLeaveCount}</strong>
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="manager-section-head">
              <div>
                <h3 className="manager-section-title">Team attendance today</h3>
                <p className="manager-section-sub">{formatDisplayDate(today)}</p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => onNavigate('leave-approval')}>
                View all leaves
              </button>
            </div>

            <div className="manager-team-tiles">
              {loading ? (
                <>
                  <SkeletonTile />
                  <SkeletonTile />
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="manager-team-tile manager-team-tile--present"
                    onClick={() => openModal('present')}
                  >
                    <span className="manager-team-tile-label">Present today</span>
                    <strong className="manager-team-tile-count">{presentCount}</strong>
                  </button>
                  <button
                    type="button"
                    className="manager-team-tile manager-team-tile--leave"
                    onClick={() => openModal('on-leave')}
                  >
                    <span className="manager-team-tile-label">On leave today</span>
                    <strong className="manager-team-tile-count">{onLeaveCount}</strong>
                  </button>
                </>
              )}
            </div>

            <div className="manager-upcoming-leaves">
              <h4 className="manager-upcoming-title">Upcoming leaves (7 days)</h4>
              {loading ? (
                <div className="manager-skeleton-line" style={{ width: '80%' }} />
              ) : upcoming.length === 0 ? (
                <p className="manager-empty-msg">No upcoming leaves in the next 7 days.</p>
              ) : (
                <ul className="manager-upcoming-list">
                  {upcoming.map((l) => (
                    <li key={l.id}>
                      <span className="manager-upcoming-name">{l.name}</span>
                      <span className="manager-upcoming-meta">
                        {l.leavetype} · {formatDisplayDate(l.fromdate)} · {daysBetween(l.fromdate, l.todate)} day
                        {daysBetween(l.fromdate, l.todate) === 1 ? '' : 's'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      {modal ? (
        <div className="manager-modal-backdrop" role="presentation" onClick={() => setModal(null)}>
          <div
            className="manager-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manager-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="manager-modal-head">
              <h3 id="manager-modal-title">
                {modal === 'present' ? 'Present today' : 'On leave today'}
              </h3>
              <button type="button" className="manager-modal-close" onClick={() => setModal(null)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="manager-modal-body">
              {modal === 'present' ? (
                present.length === 0 ? (
                  <p className="manager-empty-msg">No one marked present yet today.</p>
                ) : (
                  <ul className="manager-modal-list">
                    {present.map((r) => (
                      <li key={r.employeeid}>
                        <span className="manager-modal-avatar">{(r.name || '?').charAt(0)}</span>
                        <div>
                          <strong>{r.name}</strong>
                          <span className="manager-modal-sub">
                            {r.employeecode || ''} · In {formatTime(r.punchin)}
                            {r.status === 'halfday' ? ' · Half day' : ''}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              ) : onLeave.length === 0 ? (
                <p className="manager-empty-msg">No one on leave today 🎉</p>
              ) : (
                <ul className="manager-modal-list">
                  {onLeave.map((l) => (
                    <li key={l.id}>
                      <span className="manager-modal-avatar">{(l.name || '?').charAt(0)}</span>
                      <div>
                        <strong>{l.name}</strong>
                        <span className="manager-modal-sub">
                          {l.leavetype} · Returns {formatDisplayDate(l.todate)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
